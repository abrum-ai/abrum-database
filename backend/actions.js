// Agent tools for abrum.table. Every table, column and row is a signed twin;
// these functions read them through ctx.db and write new heads. Writes are
// applied after the function returns, so each function reads first, then
// emits all of its writes.
//
// Storage rules mirror src/lib/columns.ts: twins reject floats, so number and
// currency values are integers scaled by 10^decimals. Agents always see and
// send display units.

const COLUMN_TYPES = [
  "text", "longText", "number", "currency", "percent", "rating", "select", "multiSelect",
  "person", "date", "checkbox", "url", "email", "phone", "image", "trend",
];
const OPTION_COLORS = ["gray", "red", "orange", "amber", "green", "teal", "blue", "indigo", "violet", "pink"];
const AGGREGATES = ["sum", "avg", "min", "max", "count"];
const PAGE = 500;
const MAX_ROWS = 5000;

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

function cleanConfig(type, config) {
  if (config === undefined || config === null) return {};
  if (typeof config !== "object" || Array.isArray(config)) fail("config must be an object");
  const out = {};
  for (const [key, value] of Object.entries(config)) {
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
function toStored(column, value, added) {
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
    case "trend": {
      const list = Array.isArray(value) ? value : String(value).split(/[\s,]+/);
      return list.map((item) => Math.round(Number(item))).filter(Number.isFinite).slice(0, 60);
    }
    case "image": {
      const raw = String(value).trim();
      if (!/^https:\/\//i.test(raw) && !/^blob:[a-f0-9]+$/i.test(raw)) fail(`${column.label} expects an https image URL`);
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

/** Stored twin value → display units for agents. */
function toDisplay(column, stored) {
  if (stored === null || stored === undefined) return null;
  if ((column.type === "number" || column.type === "currency") && typeof stored === "number") return stored / scale(column);
  return stored;
}

function textOf(column, stored) {
  if (stored === null || stored === undefined) return "";
  if (Array.isArray(stored)) return stored.join(" ");
  if (column.type === "select" || column.type === "person" || column.type === "multiSelect") {
    const option = (column.config.options || []).find((item) => item.value === stored);
    return `${stored} ${option?.label || ""}`;
  }
  return String(toDisplay(column, stored));
}

// ---- reads -----------------------------------------------------------------

async function loadTables(ctx) {
  return ctx.db.table.findMany({ orderBy: { createdAtMs: "asc" }, limit: 200 });
}

async function resolveTable(ctx, ref) {
  const wanted = text(ref, "table");
  const byKey = await ctx.db.table.findFirst({ where: { key: wanted } });
  if (byKey) return byKey;
  const tables = await loadTables(ctx);
  const match = tables.find((table) => table.name.toLowerCase() === wanted.toLowerCase())
    || tables.find((table) => table.key.toLowerCase() === wanted.toLowerCase());
  if (!match) fail(`table ${wanted} not found. Existing tables: ${tables.map((table) => table.key).join(", ") || "none"}`);
  return match;
}

async function loadColumns(ctx, tableKey) {
  const records = await ctx.db.column.findMany({ where: { tableKey }, limit: 500 });
  return records
    .map((record) => ({ record, key: record.key, label: record.label, type: record.type, config: { ...(record.config || {}) }, required: record.required === true, hidden: record.hidden === true, order: Number(record.order) || 0 }))
    .sort((a, b) => a.order - b.order);
}

function resolveColumn(columns, ref) {
  const wanted = text(ref, "column");
  const column = columns.find((item) => item.key === wanted)
    || columns.find((item) => item.label.toLowerCase() === wanted.toLowerCase())
    || columns.find((item) => item.key.toLowerCase() === wanted.toLowerCase());
  if (!column) fail(`column ${wanted} not found. Columns: ${columns.map((item) => item.key).join(", ")}`);
  return column;
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

function describeColumn(column) {
  return { key: column.key, label: column.label, type: column.type, config: column.config, required: column.required, hidden: column.hidden, order: column.order };
}

function persistColumnOptions(ctx, columns, added, now) {
  for (const column of columns) {
    if (added.has(column.key)) ctx.db.column.update(column.record, { config: column.config, updatedAtMs: now });
  }
}

/** Map {key|label: displayValue} to stored values. */
function convertValues(columns, input, added) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("row values must be an object");
  const values = {};
  for (const [ref, value] of Object.entries(input)) {
    const column = resolveColumn(columns, ref);
    values[column.key] = toStored(column, value, added);
  }
  return values;
}

function requireValues(columns, values) {
  for (const column of columns) {
    const value = values[column.key];
    if (column.required && column.type !== "checkbox" && (value === null || value === undefined || (Array.isArray(value) && !value.length))) {
      fail(`${column.label} is required`);
    }
  }
}

function strip(values) {
  const out = {};
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined) out[key] = value;
  return out;
}

// ---- functions -------------------------------------------------------------

module.exports.listTables = async function listTables(ctx) {
  const tables = await loadTables(ctx);
  if (!tables.length) return { data: { tables: [] } };
  const keys = tables.map((table) => table.key);
  const [columns, counts] = await Promise.all([
    ctx.db.column.findMany({ where: { tableKey: keys }, limit: 500 }),
    ctx.db.row.countMany(keys.map((tableKey) => ({ where: { tableKey } }))),
  ]);
  return {
    data: {
      tables: tables.map((table, index) => ({
        key: table.key, name: table.name, description: table.description || null, itemName: table.itemName || null, rows: counts[index],
        columns: columns
          .filter((column) => column.tableKey === table.key)
          .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
          .map((column) => `${column.key} (${column.type})`),
      })),
    },
  };
};

module.exports.describeTable = async function describeTable(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  const columns = await loadColumns(ctx, table.key);
  const rows = await ctx.db.row.count({ where: { tableKey: table.key } });
  return { data: { key: table.key, name: table.name, description: table.description || null, itemName: table.itemName || null, rows, columns: columns.map(describeColumn) } };
};

module.exports.queryRows = async function queryRows(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  const columns = await loadColumns(ctx, table.key);
  let rows = await loadRows(ctx, table.key);
  const search = typeof input.search === "string" ? input.search.trim().toLowerCase() : "";
  if (search) rows = rows.filter((row) => columns.some((column) => textOf(column, row.values?.[column.key]).toLowerCase().includes(search)));
  const filters = input.filters === undefined || input.filters === null ? [] : input.filters;
  if (!Array.isArray(filters)) fail("filters must be an array of {column, op, value}");
  for (const filter of filters) {
    const column = resolveColumn(columns, filter?.column);
    const op = filter.op || "eq";
    const target = filter.value;
    rows = rows.filter((row) => {
      const display = toDisplay(column, row.values?.[column.key]);
      const empty = display === null || display === undefined || display === "" || (Array.isArray(display) && !display.length);
      switch (op) {
        case "empty": return empty;
        case "notEmpty": return !empty;
        case "eq": return Array.isArray(display) ? display.includes(target) : display === target || String(display ?? "").toLowerCase() === String(target).toLowerCase();
        case "neq": return !(display === target || String(display ?? "").toLowerCase() === String(target).toLowerCase());
        case "contains": return Array.isArray(display) ? display.includes(target) : textOf(column, row.values?.[column.key]).toLowerCase().includes(String(target).toLowerCase());
        case "in": return Array.isArray(target) && (Array.isArray(display) ? display.some((item) => target.includes(item)) : target.includes(display));
        case "gt": return !empty && display > target;
        case "gte": return !empty && display >= target;
        case "lt": return !empty && display < target;
        case "lte": return !empty && display <= target;
        default: fail(`unknown filter op ${op}`);
      }
    });
  }
  if (input.sort) {
    const column = resolveColumn(columns, input.sort.column);
    const direction = input.sort.direction === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      const left = a.values?.[column.key];
      const right = b.values?.[column.key];
      if (left === undefined || left === null) return 1;
      if (right === undefined || right === null) return -1;
      return (left > right ? 1 : left < right ? -1 : 0) * direction;
    });
  }
  const total = rows.length;
  const offset = Math.max(0, Number(input.offset) || 0);
  const limit = Math.max(1, Math.min(500, Number(input.limit) || 50));
  const page = rows.slice(offset, offset + limit).map((row) => {
    const values = {};
    for (const column of columns) {
      const value = toDisplay(column, row.values?.[column.key]);
      if (value !== null && value !== undefined) values[column.key] = value;
    }
    return { id: row.id, values };
  });
  return { data: { table: table.key, total, offset, rows: page, columns: columns.map((column) => `${column.key} (${column.type})`) } };
};

module.exports.createTable = async function createTable(ctx, input) {
  const name = text(input.name, "name");
  const tables = await loadTables(ctx);
  const requested = input.key ? slugKey(input.key) : slugKey(name);
  if (input.key && tables.some((table) => table.key === requested)) fail(`table key ${requested} already exists`);
  const key = uniqueKey(requested || "table", tables.map((table) => table.key));
  const now = ctx.nowMs();
  const order = tables.reduce((max, table) => Math.max(max, Number(table.order) || 0), -1) + 1;
  ctx.db.table.create({
    key, name, order, createdAtMs: now, updatedAtMs: now,
    ...(input.description ? { description: String(input.description) } : {}),
    ...(input.itemName ? { itemName: String(input.itemName) } : {}),
  });
  const specs = input.columns === undefined || input.columns === null ? [] : input.columns;
  if (!Array.isArray(specs)) fail("columns must be an array");
  const keys = [];
  const created = specs.map((spec, index) => {
    const label = text(spec?.label, "column label");
    const type = columnType(spec.type || "text");
    const columnKey = uniqueKey(spec.key ? slugKey(spec.key) : slugKey(label), keys);
    keys.push(columnKey);
    ctx.db.column.create({
      tableKey: key, key: columnKey, label, type, config: cleanConfig(type, spec.config), order: index,
      ...(spec.required ? { required: true } : {}), createdAtMs: now, updatedAtMs: now,
    });
    return `${columnKey} (${type})`;
  });
  return { data: { key, name, columns: created } };
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
  const columns = await loadColumns(ctx, table.key);
  const rows = await loadRows(ctx, table.key);
  for (const row of rows) ctx.db.row.delete(row);
  for (const column of columns) ctx.db.column.delete(column.record);
  ctx.db.table.delete(table);
  return { data: { deleted: table.key, rows: rows.length, columns: columns.length } };
};

module.exports.addColumn = async function addColumn(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  const columns = await loadColumns(ctx, table.key);
  const label = text(input.label, "label");
  const type = columnType(input.type);
  const requested = input.key ? slugKey(input.key) : slugKey(label);
  if (input.key && columns.some((column) => column.key === requested)) fail(`column key ${requested} already exists`);
  const key = uniqueKey(requested, columns.map((column) => column.key));
  const now = ctx.nowMs();
  const position = input.position === undefined ? columns.length : Math.max(0, Math.min(columns.length, Math.trunc(Number(input.position)) || 0));
  // Renumber so the new column lands exactly at `position`.
  columns.forEach((column, index) => {
    const order = index < position ? index : index + 1;
    if (column.order !== order) ctx.db.column.update(column.record, { order, updatedAtMs: now });
  });
  const config = cleanConfig(type, input.config);
  ctx.db.column.create({
    tableKey: table.key, key, label, type, config, order: position,
    ...(input.required ? { required: true } : {}), createdAtMs: now, updatedAtMs: now,
  });
  return { data: { table: table.key, column: { key, label, type, config, position } } };
};

module.exports.updateColumn = async function updateColumn(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  const columns = await loadColumns(ctx, table.key);
  const column = resolveColumn(columns, input.column);
  const now = ctx.nowMs();
  const patch = { updatedAtMs: now };
  const nextType = input.type === undefined ? column.type : columnType(input.type);
  if (input.label !== undefined) patch.label = text(input.label, "label");
  if (input.required !== undefined) patch.required = input.required === true;
  if (input.hidden !== undefined) patch.hidden = input.hidden === true;
  if (input.config !== undefined || nextType !== column.type) {
    const merged = { ...column.config };
    for (const [key, value] of Object.entries(input.config || {})) {
      if (value === null) delete merged[key];
      else merged[key] = value;
    }
    patch.config = cleanConfig(nextType, merged);
  }
  let converted = 0;
  if (nextType !== column.type) {
    patch.type = nextType;
    const target = { ...column, type: nextType, config: patch.config };
    if ((nextType === "select" || nextType === "multiSelect" || nextType === "person") && !target.config.options) target.config.options = [];
    const rows = await loadRows(ctx, table.key);
    for (const row of rows) {
      const stored = row.values?.[column.key];
      if (stored === null || stored === undefined) continue;
      const display = toDisplay(column, stored);
      let next;
      try {
        const added = new Set();
        next = nextType === "multiSelect"
          ? toStored(target, Array.isArray(display) ? display : [display], added)
          : toStored(target, Array.isArray(display) ? display.join(", ") : display, added);
      } catch {
        next = null;
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
  ctx.db.column.delete(column.record);
  return { data: { table: table.key, removed: column.key } };
};

module.exports.addRows = async function addRows(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  const columns = await loadColumns(ctx, table.key);
  if (!Array.isArray(input.rows) || input.rows.length === 0) fail("rows must be a non-empty array");
  if (input.rows.length > 500) fail("add at most 500 rows per call");
  const now = ctx.nowMs();
  const added = new Set();
  const ids = input.rows.map((values, index) => {
    const stored = strip(convertValues(columns, values, added));
    requireValues(columns, stored);
    const id = rowId(ctx, index);
    // Distinct createdAtMs keeps the cursor order stable within one call.
    ctx.db.row.create({ tableKey: table.key, id, values: stored, createdAtMs: now + index, updatedAtMs: now });
    return id;
  });
  persistColumnOptions(ctx, columns, added, now);
  return { data: { table: table.key, ids, newOptions: [...added] } };
};

module.exports.updateRows = async function updateRows(ctx, input) {
  const table = await resolveTable(ctx, input.table);
  const columns = await loadColumns(ctx, table.key);
  if (!Array.isArray(input.updates) || input.updates.length === 0) fail("updates must be a non-empty array of {id, values}");
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
    const values = strip({ ...(row.values || {}), ...convertValues(columns, update.values, added) });
    requireValues(columns, values);
    ctx.db.row.update(row, { values, updatedAtMs: now });
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
