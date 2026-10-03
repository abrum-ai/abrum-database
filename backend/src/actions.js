// Agent tools for abrum.table. Every table, column, view and row is a signed
// twin; these functions read them through ctx.db and write new heads. Writes
// are applied after the function returns, so each function reads first, then
// emits all of its writes.
//
// Storage rules mirror src/lib/columns.ts: twins reject floats, so number and
// currency values are integers scaled by 10^decimals. Agents always see and
// send display units. Formulas, rollups and created/edited time are computed
// by shared/compute.js (inlined above by scripts/build-backend.mjs).

const COLUMN_TYPES = [
  "text", "longText", "number", "currency", "percent", "rating", "select", "multiSelect",
  "person", "date", "checkbox", "url", "email", "phone", "image", "trend",
  "relation", "rollup", "formula", "createdTime", "editedTime",
];
const COMPUTED = new Set(COMPUTED_TYPES);
const OPTION_COLORS = ["gray", "red", "orange", "amber", "green", "teal", "blue", "indigo", "violet", "pink"];
const AGGREGATES = ["sum", "avg", "min", "max", "count", "countEmpty", "countNotEmpty"];
const LAYOUTS = ["table", "board", "gallery", "list"];
const FILTER_OPS = ["eq", "neq", "contains", "gt", "gte", "lt", "lte", "empty", "notEmpty", "in"];
const PAGE = 500;
const MAX_ROWS = 10000;
const MAX_BODY = 200000;

// ---- helpers ---------------------------------------------------------------

function fail(message) {
  throw new Error(message);
}

function text(value, name) {
  if (typeof value !== "string" || !value.trim()) fail(`${name} is required`);
  return value.trim();
}

function slugKey(value) {
  const words = String(value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.map((word, index) => (index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase())).join("");
}

function uniqueKey(base, taken) {
  const used = new Set(taken);
  const root = base || "column";
  if (!used.has(root)) return root;
  for (let index = 2; ; index += 1) if (!used.has(root + index)) return root + index;
}

function rowId(ctx, index) {
  const time = ctx.nowMs().toString(36);
  const random = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, "0");
  return `r_${time}${index.toString(36)}${random}`;
}

function scale(column) {
  const fallback = column.type === "currency" ? 2 : 0;
  const decimals = Number.isInteger(column.config?.decimals) ? column.config.decimals : fallback;
  return 10 ** Math.max(0, Math.min(6, decimals));
}

function plainObject(value, name) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  return value;
}

function cleanConfig(type, config, context = {}) {
  const out = {};
  for (const [key, value] of Object.entries(plainObject(config, "config"))) {
    if (value === null || value === undefined) continue;
    switch (key) {
      case "options": {
        if (!Array.isArray(value)) fail("config.options must be an array");
        const seen = new Set();
        out.options = value.map((option) => {
          const raw = typeof option === "string" ? { value: option } : option;
          if (!raw || typeof raw !== "object") fail("each option needs a value");
          const optionValue = text(String(raw.value ?? raw.label ?? ""), "option value");
          if (seen.has(optionValue)) fail(`duplicate option ${optionValue}`);
          seen.add(optionValue);
          const clean = { value: optionValue };
          if (typeof raw.label === "string" && raw.label.trim() && raw.label.trim() !== optionValue) clean.label = raw.label.trim();
          if (typeof raw.color === "string") {
            if (!OPTION_COLORS.includes(raw.color)) fail(`option color must be one of ${OPTION_COLORS.join(", ")}`);
            clean.color = raw.color;
          }
          if (typeof raw.image === "string" && raw.image.trim()) clean.image = raw.image.trim();
          return clean;
        });
        break;
      }
      case "decimals":
      case "max":
      case "width":
        if (!Number.isInteger(value) || value < 0) fail(`config.${key} must be a non-negative integer`);
        out[key] = value;
        break;
      case "aggregate":
        if (!AGGREGATES.includes(value)) fail(`config.aggregate must be one of ${AGGREGATES.join(", ")}`);
        out.aggregate = value;
        break;
      case "currency":
        if (typeof value !== "string" || !/^[A-Za-z]{3}$/.test(value)) fail("config.currency must be an ISO code like EUR");
        out.currency = value.toUpperCase();
        break;
      case "single":
        out.single = value === true;
        break;
      case "expression":
        try {
          parseFormula(String(value));
        } catch (error) {
          fail(`config.expression: ${error.message}`);
        }
        out.expression = String(value);
        break;
      case "fn":
        if (!ROLLUP_FUNCTIONS.includes(value)) fail(`config.fn must be one of ${ROLLUP_FUNCTIONS.join(", ")}`);
        out.fn = value;
        break;
      case "tableKey":
      case "relation":
      case "property":
      case "format":
      case "section":
      case "placeholder":
      case "description":
        if (typeof value !== "string") fail(`config.${key} must be a string`);
        if (value.trim()) out[key] = value.trim();
        break;
      default:
        fail(`unknown config key ${key}`);
    }
  }
  if (type === "rating" && out.max === undefined) out.max = 5;
  if (type === "relation") {
    if (!out.tableKey) fail("relation columns need config.tableKey (the related table)");
    if (context.tables && !context.tables.some((table) => table.key === out.tableKey)) fail(`related table ${out.tableKey} not found`);
  }
  if (type === "formula" && !out.expression) fail('formula columns need config.expression, e.g. prop("Price") * prop("Quantity")');
  if (type === "rollup") {
    if (!out.relation) fail("rollup columns need config.relation (a relation column key)");
    if (context.columns) {
      const relation = context.columns.find((column) => column.key === out.relation || column.label === out.relation);
      if (!relation || relation.type !== "relation") fail(`config.relation ${out.relation} is not a relation column`);
      out.relation = relation.key;
    }
    out.fn = out.fn || "count";
    if (out.fn !== "count" && !out.property) fail("rollup config.property is required unless fn is count");
  }
  return out;
}

function columnType(value) {
  const type = text(value, "type");
  if (!COLUMN_TYPES.includes(type)) fail(`type must be one of ${COLUMN_TYPES.join(", ")}`);
  return type;
}

function optionFromInput(column, value, added) {
  const raw = String(value).trim();
  if (!raw) return null;
  const options = column.config.options || (column.config.options = []);
  const match = options.find((option) => option.value === raw)
    || options.find((option) => (option.label || option.value).toLowerCase() === raw.toLowerCase());
  if (match) return match.value;
  options.push({ value: raw, color: OPTION_COLORS[(options.length + 4) % OPTION_COLORS.length] });
  added.add(column.key);
  return raw;
}

/** Display-unit input → stored twin value. `added` collects columns whose options grew. */
function toStored(column, value, added, related) {
  if (COMPUTED.has(column.type)) fail(`${column.label} is computed and cannot be set`);
  if (value === null || value === undefined || value === "") return null;
  switch (column.type) {
    case "number":
    case "currency":
    case "percent":
    case "rating": {
      const raw = String(value);
      const number = typeof value === "number" ? value : /\d/.test(raw) ? Number(raw.replace(/[^0-9.+-]/g, "")) : NaN;
      if (!Number.isFinite(number)) fail(`${column.label} expects a number`);
      if (column.type === "percent") return Math.max(0, Math.min(100, Math.round(number)));
      if (column.type === "rating") return Math.max(0, Math.min(column.config.max || 5, Math.round(number)));
      return Math.round(number * scale(column));
    }
    case "checkbox":
      return value === true || value === "true" || value === 1 || value === "yes";
    case "date": {
      const raw = String(value).trim();
      if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) fail(`${column.label} expects a date as YYYY-MM-DD`);
      return raw.slice(0, 10);
    }
    case "select":
    case "person":
      return optionFromInput(column, value, added);
    case "multiSelect": {
      const list = Array.isArray(value) ? value : String(value).split(",");
      return [...new Set(list.map((item) => optionFromInput(column, item, added)).filter(Boolean))];
    }
    case "relation": {
      const list = (Array.isArray(value) ? value : [value]).map((item) => (item && typeof item === "object" ? item.id : item));
      const ids = list.map((item) => {
        const wanted = String(item).trim();
        if (!related) return wanted;
        if (related.byId.has(wanted)) return wanted;
        const match = related.byTitle.get(wanted.toLowerCase());
        if (!match) fail(`${column.label}: no row “${wanted}” in ${column.config.tableKey}`);
        return match;
      });
      const unique = [...new Set(ids)];
      return column.config.single ? unique.slice(0, 1) : unique;
    }
    case "trend": {
      const list = Array.isArray(value) ? value : String(value).split(/[\s,]+/);
      return list.map((item) => Math.round(Number(item))).filter(Number.isFinite).slice(0, 60);
    }
    case "image": {
      const raw = String(value).trim();
      if (!/^https:\/\//i.test(raw) && !/^blob:[a-z0-9]+$/i.test(raw)) fail(`${column.label} expects an https image URL`);
      return raw;
    }
    case "url": {
      const raw = String(value).trim();
      return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    }
    default:
      return String(value);
  }
}

// ---- reads -----------------------------------------------------------------

async function loadTables(ctx) {
  return ctx.db.table.findMany({ orderBy: { createdAtMs: "asc" }, limit: 500 });
}

async function resolveTable(ctx, ref, tables) {
  const wanted = text(ref, "table");
  const list = tables || await loadTables(ctx);
  const match = list.find((table) => table.key === wanted)
    || list.find((table) => table.name.toLowerCase() === wanted.toLowerCase())
    || list.find((table) => table.key.toLowerCase() === wanted.toLowerCase());
  if (!match) fail(`table ${wanted} not found. Existing tables: ${list.map((table) => table.key).join(", ") || "none"}`);
  return match;
}

function normalizeColumn(record) {
  return {
    record, key: record.key, label: record.label, type: record.kind,
    config: { ...(record.config || {}) }, required: record.required === true, order: Number(record.order) || 0,
  };
}

async function loadColumns(ctx, tableKey) {
  const records = await ctx.db.column.findMany({ where: { tableKey }, limit: 500 });
  return records.map(normalizeColumn).sort((a, b) => a.order - b.order);
}

async function loadViews(ctx, tableKey) {
  const records = await ctx.db.view.findMany({ where: { tableKey }, limit: 200 });
  return records.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

function resolveColumn(columns, ref) {
  const wanted = text(ref, "column");
  const column = columns.find((item) => item.key === wanted)
    || columns.find((item) => item.label.toLowerCase() === wanted.toLowerCase())
    || columns.find((item) => item.key.toLowerCase() === wanted.toLowerCase());
  if (!column) fail(`column ${wanted} not found. Columns: ${columns.map((item) => item.key).join(", ")}`);
  return column;
}

function resolveView(views, ref) {
  const wanted = text(ref, "view");
  const view = views.find((item) => item.key === wanted) || views.find((item) => item.name.toLowerCase() === wanted.toLowerCase());
  if (!view) fail(`view ${wanted} not found. Views: ${views.map((item) => item.key).join(", ") || "none"}`);
  return view;
}

async function loadRows(ctx, tableKey) {
  const rows = [];
  let after;
  while (rows.length < MAX_ROWS) {
    const page = await ctx.db.row.findMany({ where: { tableKey }, orderBy: { createdAtMs: "asc" }, limit: PAGE, ...(after ? { after } : {}) });
    rows.push(...page);
    if (page.length < PAGE) break;
    const last = page[page.length - 1];
    after = { value: last.createdAtMs, lineageCid: last.$.lineageCid || last.$.cid };
  }
  return rows;
}

/**
 * Loads a table plus every table its relations and rollups reach (two hops),
 * and returns a shared computer for formulas, rollups and relation titles.
 */
async function loadGraph(ctx, tableKey, tables) {
  const graph = new Map();
  const queue = [{ key: tableKey, depth: 0 }];
  while (queue.length) {
    const { key, depth } = queue.shift();
    if (graph.has(key) || !tables.some((table) => table.key === key)) continue;
    const columns = await loadColumns(ctx, key);
    const rows = await loadRows(ctx, key);
    graph.set(key, { columns, rows: new Map(rows.map((row) => [row.id, row])), list: rows });
    if (depth < 2) {
      for (const column of columns) if (column.type === "relation" && column.config.tableKey) queue.push({ key: column.config.tableKey, depth: depth + 1 });
    }
  }
  return { graph, computer: createComputer(graph) };
}

/** Lookup of related rows by id and by primary title for relation input. */
function relatedIndex(graph, computer, tableKey) {
  const target = graph.get(tableKey);
  if (!target) return null;
  const byTitle = new Map();
  for (const row of target.list) {
    const title = computer.titleOf(tableKey, row).toLowerCase();
    if (title && !byTitle.has(title)) byTitle.set(title, row.id);
  }
  return { byId: target.rows, byTitle };
}

/** Value as agents see it: display units, option values, relation objects, computed results. */
function agentValue(graph, computer, tableKey, row, column) {
  const stored = row.values ? row.values[column.key] : undefined;
  if (COMPUTED.has(column.type)) {
    const result = computer.value(tableKey, row, column);
    return result.error ? { error: result.error } : result.value;
  }
  if (stored === null || stored === undefined) return null;
  if ((column.type === "number" || column.type === "currency") && typeof stored === "number") return stored / scale(column);
  if (column.type === "relation") {
    const target = column.config.tableKey;
    return (Array.isArray(stored) ? stored : []).map((id) => {
      const related = graph.get(target)?.rows.get(id);
      return { id, title: related ? computer.titleOf(target, related) : null };
    });
  }
  return stored;
}

function searchText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(searchText).join(" ");
  if (typeof value === "object") return searchText(value.title ?? value.error ?? "");
  return String(value);
}

function comparable(value) {
  if (Array.isArray(value)) return value.map(searchText).join(", ").toLowerCase();
  if (value && typeof value === "object") return searchText(value).toLowerCase();
  return typeof value === "string" ? value.toLowerCase() : value;
}

function matchFilter(column, display, filter) {
  const op = filter.op || "eq";
  if (!FILTER_OPS.includes(op)) fail(`filter op must be one of ${FILTER_OPS.join(", ")}`);
  const target = filter.value;
  const empty = display === null || display === undefined || display === "" || (Array.isArray(display) && display.length === 0);
  const optionLabel = (value) => {
    const option = (column.config.options || []).find((item) => item.value === value);
    return option ? (option.label || option.value).toLowerCase() : String(value).toLowerCase();
  };
  const listValues = Array.isArray(display) ? display.map((item) => (item && typeof item === "object" ? String(item.title ?? item.id).toLowerCase() : String(item).toLowerCase())) : null;
  const scalarHit = (value) => {
    const wanted = String(value).toLowerCase();
    if (listValues) return listValues.includes(wanted) || (Array.isArray(display) && display.some((item) => optionLabel(item) === wanted || (item && typeof item === "object" && item.id === value)));
    return String(display ?? "").toLowerCase() === wanted || optionLabel(display) === wanted;
  };
  switch (op) {
    case "empty": return empty;
    case "notEmpty": return !empty;
    case "eq": return typeof target === "boolean" ? display === target : typeof target === "number" ? display === target : scalarHit(target);
    case "neq": return typeof target === "boolean" ? display !== target : typeof target === "number" ? display !== target : !scalarHit(target);
    case "contains": return listValues ? scalarHit(target) || listValues.some((item) => item.includes(String(target).toLowerCase())) : searchText(display).toLowerCase().includes(String(target).toLowerCase());
    case "in": return Array.isArray(target) && target.some(scalarHit);
    default: {
      if (empty) return false;
      const left = comparable(display);
      const right = typeof left === "number" ? Number(target) : comparable(target);
      if (op === "gt") return left > right;
      if (op === "gte") return left >= right;
      if (op === "lt") return left < right;
      return left <= right;
    }
  }
}

function describeColumn(column) {
  return { key: column.key, label: column.label, type: column.type, config: column.config, required: column.required, order: column.order };
}

function describeView(view) {
  return { key: view.key, name: view.name, layout: view.layout, config: view.config || {}, order: Number(view.order) || 0 };
}

function persistColumnOptions(ctx, columns, added, now) {
  for (const column of columns) {
    if (added.has(column.key)) ctx.db.column.update(column.record, { config: column.config, updatedAtMs: now });
  }
}

function strip(values) {
  const out = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)) out[key] = value;
  }
  return out;
}

function requireValues(columns, values) {
  for (const column of columns) {
    if (!column.required || column.type === "checkbox" || COMPUTED.has(column.type)) continue;
    const value = values[column.key];
    if (value === null || value === undefined || (Array.isArray(value) && !value.length)) fail(`${column.label} is required`);
  }
}

/** Accept either {column: value, ...} or {values: {...}, body: "..."}. */
function splitRowInput(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) fail("each row must be an object");
  const keys = Object.keys(item);
  if (keys.includes("values") && keys.every((key) => key === "values" || key === "body" || key === "id")) {
    return { values: plainObject(item.values, "values"), body: item.body };
  }
  return { values: item, body: undefined };
}

function cleanBody(body) {
  if (body === undefined) return undefined;
  if (body === null) return "";
  if (typeof body !== "string") fail("body must be text (Markdown)");
  if (body.length > MAX_BODY) fail(`body is longer than ${MAX_BODY} characters`);
  return body;
}

function convertValues(columns, input, added, relatedFor) {
  const values = {};
  for (const [ref, value] of Object.entries(plainObject(input, "values"))) {
    const column = resolveColumn(columns, ref);
    values[column.key] = toStored(column, value, added, column.type === "relation" ? relatedFor(column) : null);
  }
  return values;
}

function viewConfig(config, columns) {
  const raw = plainObject(config, "view config");
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;
    switch (key) {
      case "filters":
        if (!Array.isArray(value)) fail("config.filters must be an array of {column, op, value}");
        out.filters = value.map((filter) => {
          const column = resolveColumn(columns, filter?.column);
          const op = filter.op || "eq";
          if (!FILTER_OPS.includes(op)) fail(`filter op must be one of ${FILTER_OPS.join(", ")}`);
          return { column: column.key, op, ...(filter.value === undefined ? {} : { value: filter.value }) };
        });
        break;
      case "filterMode":
        if (value !== "and" && value !== "or") fail("config.filterMode must be and or or");
        out.filterMode = value;
        break;
      case "sorts":
        if (!Array.isArray(value)) fail("config.sorts must be an array of {column, direction}");
        out.sorts = value.map((sort) => ({ column: resolveColumn(columns, sort?.column).key, direction: sort.direction === "desc" ? "desc" : "asc" }));
        break;
      case "columns":
        if (!Array.isArray(value)) fail("config.columns must be an array of {key, hidden?, width?}");
        out.columns = value.map((entry) => {
          const column = resolveColumn(columns, typeof entry === "string" ? entry : entry?.key);
          const clean = { key: column.key };
          if (entry && typeof entry === "object" && entry.hidden === true) clean.hidden = true;
          if (entry && typeof entry === "object" && Number.isInteger(entry.width) && entry.width > 40) clean.width = Math.min(800, entry.width);
          return clean;
        });
        break;
      case "groupBy":
      case "cover": {
        const column = resolveColumn(columns, value);
        if (key === "groupBy" && !["select", "person", "checkbox"].includes(column.type)) fail("groupBy needs a select, person or checkbox column");
        if (key === "cover" && column.type !== "image") fail("cover needs an image column");
        out[key] = column.key;
        break;
      }
      case "cardColumns":
        if (!Array.isArray(value)) fail("config.cardColumns must be an array of column keys");
        out.cardColumns = value.map((ref) => resolveColumn(columns, ref).key);
        break;
      case "wrap":
        out.wrap = value === true;
        break;
      default:
        fail(`unknown view config key ${key}`);
    }
  }
  return out;
}

// ---- functions -------------------------------------------------------------

module.exports.listTables = async function listTables(ctx) {
  const tables = await loadTables(ctx);
  if (!tables.length) return { data: { tables: [] } };
  const keys = tables.map((table) => table.key);
  const [columns, views, counts] = await Promise.all([
    ctx.db.column.findMany({ where: { tableKey: keys }, limit: 500 }),
    ctx.db.view.findMany({ where: { tableKey: keys }, limit: 500 }),
    ctx.db.row.countMany(keys.map((tableKey) => ({ where: { tableKey } }))),
  ]);
  return {
    data: {
      tables: tables.map((table, index) => ({
        key: table.key, name: table.name, description: table.description || null, itemName: table.itemName || null, rows: counts[index],
        columns: columns
          .filter((column) => column.tableKey === table.key)
          .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
          .map((column) => `${column.key} (${column.kind})`),
        views: views.filter((view) => view.tableKey === table.key).map((view) => `${view.key} (${view.layout})`),
      })),
    },
  };
};

module.exports.describeTable = async function describeTable(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  const [columns, views, rows] = await Promise.all([
    loadColumns(ctx, table.key),
    loadViews(ctx, table.key),
    ctx.db.row.count({ where: { tableKey: table.key } }),
  ]);
  return {
    data: {
      key: table.key, name: table.name, description: table.description || null, itemName: table.itemName || null, rows,
      columns: columns.map(describeColumn), views: views.map(describeView),
    },
  };
};

module.exports.queryRows = async function queryRows(ctx, input) {
  const tables = await loadTables(ctx);
  const table = await resolveTable(ctx, input.table, tables);
  const { graph, computer } = await loadGraph(ctx, table.key, tables);
  const { columns, list } = graph.get(table.key);
  const valueOf = (row, column) => agentValue(graph, computer, table.key, row, column);
  let filters = input.filters === undefined || input.filters === null ? [] : input.filters;
  let sorts = input.sort ? [input.sort] : [];
  let mode = "and";
  if (input.view) {
    const view = resolveView(await loadViews(ctx, table.key), input.view);
    const config = view.config || {};
    filters = [...(config.filters || []), ...filters];
    if (!sorts.length) sorts = (config.sorts || []).map((sort) => ({ column: sort.column, direction: sort.direction }));
    if (config.filterMode === "or" && !input.filters) mode = "or";
  }
  if (!Array.isArray(filters)) fail("filters must be an array of {column, op, value}");
  const resolvedFilters = filters.map((filter) => ({ column: resolveColumn(columns, filter?.column), filter }));
  let rows = list;
  if (resolvedFilters.length) {
    rows = rows.filter((row) => {
      const results = resolvedFilters.map(({ column, filter }) => matchFilter(column, valueOf(row, column), filter));
      return mode === "or" ? results.some(Boolean) : results.every(Boolean);
    });
  }
  const search = typeof input.search === "string" ? input.search.trim().toLowerCase() : "";
  if (search) rows = rows.filter((row) => columns.some((column) => searchText(valueOf(row, column)).toLowerCase().includes(search)) || (row.body || "").toLowerCase().includes(search));
  if (sorts.length) {
    const resolvedSorts = sorts.map((sort) => ({ column: resolveColumn(columns, sort?.column), direction: sort.direction === "desc" ? -1 : 1 }));
    rows = [...rows].sort((a, b) => {
      for (const { column, direction } of resolvedSorts) {
        const left = comparable(valueOf(a, column));
        const right = comparable(valueOf(b, column));
        if (left === right) continue;
        if (left === null || left === undefined || left === "") return 1;
        if (right === null || right === undefined || right === "") return -1;
        return (left > right ? 1 : -1) * direction;
      }
      return 0;
    });
  }
  const total = rows.length;
  const offset = Math.max(0, Number(input.offset) || 0);
  const limit = Math.max(1, Math.min(500, Number(input.limit) || 50));
  const page = rows.slice(offset, offset + limit).map((row) => {
    const values = {};
    for (const column of columns) {
      const value = valueOf(row, column);
      if (value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)) values[column.key] = value;
    }
    return { id: row.id, values, ...(input.includeBody ? { body: row.body || "" } : {}), createdAtMs: row.createdAtMs, updatedAtMs: row.updatedAtMs };
  });
  return { data: { table: table.key, total, offset, rows: page, columns: columns.map((column) => `${column.key} (${column.type})`) } };
};

module.exports.getRow = async function getRow(ctx, input) {
  const tables = await loadTables(ctx);
  const table = await resolveTable(ctx, input.table, tables);
  const id = text(input.id, "id");
  const { graph, computer } = await loadGraph(ctx, table.key, tables);
  const { columns, rows } = graph.get(table.key);
  const row = rows.get(id);
  if (!row) fail(`row ${id} not found in ${table.key}`);
  const values = {};
  for (const column of columns) values[column.key] = agentValue(graph, computer, table.key, row, column);
  return { data: { table: table.key, id, title: computer.titleOf(table.key, row), values, body: row.body || "", createdAtMs: row.createdAtMs, updatedAtMs: row.updatedAtMs } };
};

function createColumnRecords(ctx, tableKey, specs, existing, context, now, startOrder) {
  const keys = existing.map((column) => column.key);
  const created = [];
  const pending = [...existing];
  specs.forEach((spec, index) => {
    const label = text(spec?.label, "column label");
    const type = columnType(spec.type || "text");
    const key = uniqueKey(spec.key ? slugKey(spec.key) : slugKey(label), keys);
    keys.push(key);
    const config = cleanConfig(type, spec.config, { ...context, columns: pending });
    const order = startOrder + index;
    ctx.db.column.create({
      tableKey, key, label, kind: type, config, order,
      ...(spec.required ? { required: true } : {}), createdAtMs: now, updatedAtMs: now,
    });
    pending.push({ key, label, type, config });
    created.push({ key, label, type, config, order });
  });
  return created;
}

module.exports.createTable = async function createTable(ctx, input) {
  const name = text(input.name, "name");
  const tables = await loadTables(ctx);
  const requested = input.key ? slugKey(input.key) : slugKey(name);
  if (input.key && tables.some((table) => table.key === requested)) fail(`table key ${requested} already exists`);
  const key = uniqueKey(requested || "table", tables.map((table) => table.key));
  const now = ctx.nowMs();
  const order = tables.reduce((max, table) => Math.max(max, Number(table.order) || 0), -1) + 1;
  const specs = input.columns === undefined || input.columns === null ? [{ label: "Name", type: "text" }] : input.columns;
  if (!Array.isArray(specs)) fail("columns must be an array");
  // Relations may point at this new table itself.
  const context = { tables: [...tables, { key }] };
  const created = createColumnRecords(ctx, key, specs, [], context, now, 0);
  ctx.db.table.create({
    key, name, order, createdAtMs: now, updatedAtMs: now,
    ...(input.description ? { description: String(input.description) } : {}),
    ...(input.itemName ? { itemName: String(input.itemName) } : {}),
  });
  ctx.db.view.create({ tableKey: key, key: "all", name: "All", layout: "table", config: {}, order: 0, createdAtMs: now, updatedAtMs: now });
  return { data: { key, name, columns: created.map((column) => `${column.key} (${column.type})`), views: ["all (table)"] } };
};

module.exports.updateTable = async function updateTable(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  const patch = { updatedAtMs: ctx.nowMs() };
  if (input.name !== undefined) patch.name = text(input.name, "name");
  if (input.description !== undefined) patch.description = String(input.description);
  if (input.itemName !== undefined) patch.itemName = String(input.itemName);
  if (input.order !== undefined) patch.order = Math.trunc(Number(input.order)) || 0;
  ctx.db.table.update(table, patch);
  return { data: { key: table.key, ...patch } };
};

module.exports.deleteTable = async function deleteTable(ctx, input) {
  if (input.confirm !== true) fail("deleteTable requires confirm: true");
  const table = await resolveTable(ctx, input.table);
  const [columns, views, rows] = await Promise.all([loadColumns(ctx, table.key), loadViews(ctx, table.key), loadRows(ctx, table.key)]);
  for (const row of rows) ctx.db.row.delete(row);
  for (const column of columns) ctx.db.column.delete(column.record);
  for (const view of views) ctx.db.view.delete(view);
  ctx.db.table.delete(table);
  return { data: { deleted: table.key, rows: rows.length, columns: columns.length, views: views.length } };
};

module.exports.addColumn = async function addColumn(ctx, input) {
  const tables = await loadTables(ctx);
  const table = await resolveTable(ctx, input.table, tables);
  const columns = await loadColumns(ctx, table.key);
  if (input.key && columns.some((column) => column.key === slugKey(input.key))) fail(`column key ${slugKey(input.key)} already exists`);
  const now = ctx.nowMs();
  const position = input.position === undefined ? columns.length : Math.max(0, Math.min(columns.length, Math.trunc(Number(input.position)) || 0));
  // Renumber so the new column lands exactly at `position`.
  columns.forEach((column, index) => {
    const order = index < position ? index : index + 1;
    if (column.order !== order) ctx.db.column.update(column.record, { order, updatedAtMs: now });
  });
  const [created] = createColumnRecords(ctx, table.key, [input], columns, { tables }, now, position);
  return { data: { table: table.key, column: created } };
};

module.exports.updateColumn = async function updateColumn(ctx, input) {
  const tables = await loadTables(ctx);
  const table = await resolveTable(ctx, input.table, tables);
  const columns = await loadColumns(ctx, table.key);
  const column = resolveColumn(columns, input.column);
  const now = ctx.nowMs();
  const patch = { updatedAtMs: now };
  const nextType = input.type === undefined ? column.type : columnType(input.type);
  if (input.label !== undefined) patch.label = text(input.label, "label");
  if (input.required !== undefined) patch.required = input.required === true;
  if (input.config !== undefined || nextType !== column.type) {
    const merged = { ...column.config };
    for (const [key, value] of Object.entries(plainObject(input.config, "config"))) {
      if (value === null) delete merged[key];
      else merged[key] = value;
    }
    if (nextType !== column.type && ["relation", "rollup", "formula"].includes(column.type)) {
      for (const key of ["tableKey", "single", "relation", "property", "fn", "expression"]) delete merged[key];
    }
    patch.config = cleanConfig(nextType, merged, { tables, columns: columns.filter((item) => item.key !== column.key) });
  }
  let converted = 0;
  if (nextType !== column.type) {
    patch.kind = nextType;
    const target = { ...column, type: nextType, config: patch.config };
    if (["select", "multiSelect", "person"].includes(nextType) && !target.config.options) target.config.options = [];
    const sourceStored = !COMPUTED.has(column.type) && column.type !== "relation";
    const targetStored = !COMPUTED.has(nextType) && nextType !== "relation";
    const rows = await loadRows(ctx, table.key);
    for (const row of rows) {
      const stored = row.values?.[column.key];
      if (stored === null || stored === undefined) continue;
      let next;
      if (sourceStored && targetStored) {
        const display = (column.type === "number" || column.type === "currency") && typeof stored === "number" ? stored / scale(column) : stored;
        try {
          next = nextType === "multiSelect"
            ? toStored(target, Array.isArray(display) ? display : [display], new Set())
            : toStored(target, Array.isArray(display) ? display.join(", ") : display, new Set());
        } catch {
          next = null;
        }
      }
      const values = { ...row.values };
      if (next === null || next === undefined) delete values[column.key];
      else values[column.key] = next;
      ctx.db.row.update(row, { values, updatedAtMs: now });
      converted += 1;
    }
    patch.config = target.config;
  }
  if (input.position !== undefined) {
    const others = columns.filter((item) => item.key !== column.key);
    const position = Math.max(0, Math.min(others.length, Math.trunc(Number(input.position)) || 0));
    others.splice(position, 0, column);
    others.forEach((item, index) => {
      if (item.key === column.key) patch.order = index;
      else if (item.order !== index) ctx.db.column.update(item.record, { order: index, updatedAtMs: now });
    });
  }
  ctx.db.column.update(column.record, patch);
  return { data: { table: table.key, column: column.key, changed: Object.keys(patch).filter((key) => key !== "updatedAtMs"), convertedRows: converted } };
};

module.exports.removeColumn = async function removeColumn(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  const columns = await loadColumns(ctx, table.key);
  const column = resolveColumn(columns, input.column);
  const dependents = columns.filter((item) => item.type === "rollup" && item.config.relation === column.key);
  if (dependents.length) fail(`remove the rollups ${dependents.map((item) => item.label).join(", ")} first; they use ${column.label}`);
  ctx.db.column.delete(column.record);
  return { data: { table: table.key, removed: column.key } };
};

async function writePrep(ctx, tableRef) {
  const tables = await loadTables(ctx);
  const table = await resolveTable(ctx, tableRef, tables);
  const columns = await loadColumns(ctx, table.key);
  const relationTargets = [...new Set(columns.filter((column) => column.type === "relation").map((column) => column.config.tableKey))];
  const related = new Map();
  if (relationTargets.length) {
    const graph = new Map();
    for (const key of relationTargets) {
      if (!tables.some((item) => item.key === key)) continue;
      const targetColumns = await loadColumns(ctx, key);
      const rows = await loadRows(ctx, key);
      graph.set(key, { columns: targetColumns, rows: new Map(rows.map((row) => [row.id, row])), list: rows });
    }
    const computer = createComputer(graph);
    for (const key of graph.keys()) related.set(key, relatedIndex(graph, computer, key));
  }
  return { table, columns, relatedFor: (column) => related.get(column.config.tableKey) || { byId: new Map(), byTitle: new Map() } };
}

module.exports.addRows = async function addRows(ctx, input) {
  const { table, columns, relatedFor } = await writePrep(ctx, input.table);
  if (!Array.isArray(input.rows) || input.rows.length === 0) fail("rows must be a non-empty array");
  if (input.rows.length > 500) fail("add at most 500 rows per call");
  const now = ctx.nowMs();
  const added = new Set();
  const ids = input.rows.map((item, index) => {
    const { values: raw, body } = splitRowInput(item);
    const values = strip(convertValues(columns, raw, added, relatedFor));
    requireValues(columns, values);
    const id = rowId(ctx, index);
    const cleanedBody = cleanBody(body);
    // Distinct createdAtMs keeps the cursor order stable within one call.
    ctx.db.row.create({ tableKey: table.key, id, values, ...(cleanedBody ? { body: cleanedBody } : {}), createdAtMs: now + index, updatedAtMs: now });
    return id;
  });
  persistColumnOptions(ctx, columns, added, now);
  return { data: { table: table.key, ids, newOptions: [...added] } };
};

module.exports.updateRows = async function updateRows(ctx, input) {
  const { table, columns, relatedFor } = await writePrep(ctx, input.table);
  if (!Array.isArray(input.updates) || input.updates.length === 0) fail("updates must be a non-empty array of {id, values?, body?}");
  if (input.updates.length > 500) fail("update at most 500 rows per call");
  const ids = input.updates.map((update) => text(update?.id, "id"));
  const found = await ctx.db.row.findMany({ where: { id: ids }, limit: 500 });
  const byId = new Map(found.filter((row) => row.tableKey === table.key).map((row) => [row.id, row]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) fail(`rows not found in ${table.key}: ${missing.join(", ")}`);
  const now = ctx.nowMs();
  const added = new Set();
  for (const update of input.updates) {
    const row = byId.get(update.id);
    const values = strip({ ...(row.values || {}), ...convertValues(columns, update.values || {}, added, relatedFor) });
    requireValues(columns, values);
    const patch = { values, updatedAtMs: now };
    const body = cleanBody(update.body);
    if (body !== undefined) patch.body = body;
    ctx.db.row.update(row, patch);
  }
  persistColumnOptions(ctx, columns, added, now);
  return { data: { table: table.key, updated: ids, newOptions: [...added] } };
};

module.exports.deleteRows = async function deleteRows(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  if (!Array.isArray(input.ids) || input.ids.length === 0) fail("ids must be a non-empty array");
  if (input.ids.length > 500) fail("delete at most 500 rows per call");
  const ids = input.ids.map((id) => text(id, "id"));
  const rows = (await ctx.db.row.findMany({ where: { id: ids }, limit: 500 })).filter((row) => row.tableKey === table.key);
  for (const row of rows) ctx.db.row.delete(row);
  const deleted = new Set(rows.map((row) => row.id));
  return { data: { table: table.key, deleted: [...deleted], notFound: ids.filter((id) => !deleted.has(id)) } };
};

module.exports.createView = async function createView(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  const [columns, views] = await Promise.all([loadColumns(ctx, table.key), loadViews(ctx, table.key)]);
  const name = text(input.name, "name");
  const layout = input.layout || "table";
  if (!LAYOUTS.includes(layout)) fail(`layout must be one of ${LAYOUTS.join(", ")}`);
  const config = viewConfig(input.config, columns);
  if (layout === "board" && !config.groupBy) {
    const group = columns.find((column) => column.type === "select") || columns.find((column) => column.type === "person");
    if (!group) fail("a board needs config.groupBy (a select, person or checkbox column)");
    config.groupBy = group.key;
  }
  const key = uniqueKey(slugKey(name) || "view", views.map((view) => view.key));
  const now = ctx.nowMs();
  const order = views.reduce((max, view) => Math.max(max, Number(view.order) || 0), -1) + 1;
  ctx.db.view.create({ tableKey: table.key, key, name, layout, config, order, createdAtMs: now, updatedAtMs: now });
  return { data: { table: table.key, view: { key, name, layout, config, order } } };
};

module.exports.updateView = async function updateView(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  const [columns, views] = await Promise.all([loadColumns(ctx, table.key), loadViews(ctx, table.key)]);
  const view = resolveView(views, input.view);
  const patch = { updatedAtMs: ctx.nowMs() };
  if (input.name !== undefined) patch.name = text(input.name, "name");
  if (input.layout !== undefined) {
    if (!LAYOUTS.includes(input.layout)) fail(`layout must be one of ${LAYOUTS.join(", ")}`);
    patch.layout = input.layout;
  }
  if (input.config !== undefined) {
    const merged = { ...(view.config || {}) };
    for (const [key, value] of Object.entries(plainObject(input.config, "config"))) {
      if (value === null) delete merged[key];
      else merged[key] = value;
    }
    patch.config = viewConfig(merged, columns);
  }
  if (input.order !== undefined) patch.order = Math.trunc(Number(input.order)) || 0;
  ctx.db.view.update(view, patch);
  return { data: { table: table.key, view: view.key, changed: Object.keys(patch).filter((key) => key !== "updatedAtMs") } };
};

module.exports.deleteView = async function deleteView(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  const views = await loadViews(ctx, table.key);
  const view = resolveView(views, input.view);
  if (views.length <= 1) fail("a table keeps at least one view");
  ctx.db.view.delete(view);
  return { data: { table: table.key, deleted: view.key } };
};
