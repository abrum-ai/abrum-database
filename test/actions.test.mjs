// Exercises backend/actions.js against an in-memory ctx.db that follows the
// Station contract: indexed-only where/orderBy, a 500 row limit, `after`
// cursors, and writes applied only after the function returns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The package is ESM; station-js evaluates the backend as a CommonJS script.
const backendModule = { exports: {} };
new Function("module", "exports", readFileSync(new URL("../backend/actions.js", import.meta.url), "utf8"))(backendModule, backendModule.exports);
const actions = backendModule.exports;
const manifest = JSON.parse(readFileSync(new URL("../abrum.app.json", import.meta.url)));

function indexedFields(entity) {
  const schema = manifest.schemas.find((item) => item.entity === entity)?.schema;
  return new Set(Object.entries(schema.properties).filter(([, value]) => value["x-abrum-indexed"]).map(([key]) => key));
}

function contentTypeOf(entity) {
  return manifest.schemas.find((item) => item.entity === entity).contentType;
}

function createStation() {
  const store = { table: [], column: [], view: [], row: [] };
  let seq = 0;
  let clock = 1_700_000_000_000;
  const invoke = async (name, input) => {
    const pending = [];
    const db = {};
    for (const entity of Object.keys(store)) {
      const indexed = indexedFields(entity);
      const query = (options = {}) => {
        const limit = options.limit ?? 100;
        assert.ok(limit >= 1 && limit <= 500, `limit ${limit} out of range`);
        let rows = store[entity].filter((record) =>
          Object.entries(options.where ?? {}).every(([field, condition]) => {
            assert.ok(field === "cid" || indexed.has(field), `${entity}.${field} is not indexed`);
            const value = field === "cid" ? record.$.lineageCid : record[field];
            return Array.isArray(condition) ? condition.includes(value) : value === condition;
          }),
        );
        const [orderField, direction] = Object.entries(options.orderBy ?? {})[0] ?? [];
        if (orderField) {
          assert.ok(indexed.has(orderField), `${entity}.${orderField} is not indexed for orderBy`);
          rows.sort((a, b) => (a[orderField] - b[orderField] || a.$.lineageCid.localeCompare(b.$.lineageCid)) * (direction === "desc" ? -1 : 1));
        }
        if (options.after) {
          const index = rows.findIndex((record) => record.$.lineageCid === options.after.lineageCid);
          rows = rows.slice(index + 1);
        }
        return rows.slice(0, limit).map((record) => structuredClone(record));
      };
      db[entity] = {
        findMany: async (options) => query(options),
        findFirst: async (options = {}) => query({ ...options, limit: 1 })[0] ?? null,
        findUnique: async (options = {}) => query({ ...options, limit: 1 })[0] ?? null,
        count: async (options = {}) => query({ ...options, limit: 500 }).length,
        countMany: async (queries) => queries.map((options) => query({ ...options, limit: 500 }).length),
        create: (value) => {
          assert.ok(!Object.values(value).some((item) => typeof item === "number" && !Number.isInteger(item)), "twins reject floats");
          pending.push(() => {
            seq += 1;
            // Like the Station: `type` is the content discriminator.
            store[entity].push({ ...structuredClone(value), type: contentTypeOf(entity), $: { cid: `c${seq}`, lineageCid: `l${seq}` } });
          });
          return value;
        },
        update: (record, patch) => {
          pending.push(() => {
            const index = store[entity].findIndex((item) => item.$.lineageCid === record.$.lineageCid);
            assert.ok(index >= 0, "update of a missing record");
            seq += 1;
            store[entity][index] = { ...store[entity][index], ...structuredClone(patch), type: contentTypeOf(entity), $: { cid: `c${seq}`, lineageCid: record.$.lineageCid } };
          });
          return { ...record, ...patch };
        },
        delete: (record) => {
          pending.push(() => {
            store[entity] = store[entity].filter((item) => item.$.lineageCid !== record.$.lineageCid);
          });
          return { ok: true };
        },
      };
    }
    const ctx = { db, nowMs: () => (clock += 1000) };
    const result = await actions[name](ctx, input);
    for (const apply of pending) apply();
    return JSON.parse(JSON.stringify(result.data));
  };
  return { store, invoke };
}

test("every declared action has an implementation", () => {
  for (const fn of manifest.functions) assert.equal(typeof actions[fn.id], "function", fn.id);
});

test("agent builds a table, extends the schema and edits rows", async () => {
  const { store, invoke } = createStation();
  const created = await invoke("createTable", {
    name: "Suppliers",
    itemName: "Supplier",
    columns: [
      { label: "Name", type: "text", required: true },
      { label: "Contract value", type: "currency", config: { currency: "eur", aggregate: "sum" } },
    ],
  });
  assert.equal(created.key, "suppliers");
  assert.deepEqual(created.columns, ["name (text)", "contractValue (currency)"]);

  await invoke("addColumn", { table: "Suppliers", label: "Tier", type: "select", config: { options: ["A", { value: "B", color: "green" }] }, position: 1 });
  await invoke("addColumn", { table: "suppliers", label: "Logo", type: "image" });
  const described = await invoke("describeTable", { table: "suppliers" });
  assert.deepEqual(described.columns.map((column) => column.key), ["name", "tier", "contractValue", "logo"]);
  assert.equal(described.columns[2].config.currency, "EUR");

  const added = await invoke("addRows", {
    table: "suppliers",
    rows: [
      { Name: "Acme", "Contract value": 1234.56, Tier: "a" },
      { name: "Globex", contractValue: "€ 99", tier: "C", logo: "https://example.com/logo.png" },
    ],
  });
  assert.equal(added.ids.length, 2);
  assert.deepEqual(added.newOptions, ["tier"]);
  const acme = store.row.find((row) => row.values.name === "Acme");
  assert.equal(acme.values.contractValue, 123456, "currency stored in minor units");
  assert.equal(acme.values.tier, "A", "select matched case-insensitively");
  assert.deepEqual(store.column.find((column) => column.key === "tier").config.options.map((option) => option.value), ["A", "B", "C"]);

  const queried = await invoke("queryRows", { table: "suppliers", sort: { column: "contractValue", direction: "desc" } });
  assert.deepEqual(queried.rows.map((row) => row.values.name), ["Acme", "Globex"]);
  assert.equal(queried.rows[0].values.contractValue, 1234.56, "display units for agents");

  const filtered = await invoke("queryRows", { table: "suppliers", filters: [{ column: "Contract value", op: "lt", value: 100 }] });
  assert.deepEqual(filtered.rows.map((row) => row.values.name), ["Globex"]);
  const searched = await invoke("queryRows", { table: "suppliers", search: "acm" });
  assert.equal(searched.total, 1);

  await invoke("updateRows", { table: "suppliers", updates: [{ id: acme.id, values: { tier: null, "Contract value": 10 } }] });
  const updated = store.row.find((row) => row.id === acme.id);
  assert.equal(updated.values.tier, undefined);
  assert.equal(updated.values.contractValue, 1000);

  await assert.rejects(invoke("addRows", { table: "suppliers", rows: [{ tier: "A" }] }), /Name is required/);
  await assert.rejects(invoke("addColumn", { table: "suppliers", label: "X", type: "spreadsheet" }), /type must be one of/);
  await assert.rejects(invoke("queryRows", { table: "nope" }), /not found/);

  await invoke("deleteRows", { table: "suppliers", ids: [acme.id] });
  assert.equal(store.row.length, 1);
});

test("changing a column type converts existing values", async () => {
  const { store, invoke } = createStation();
  await invoke("createTable", { name: "Deals", columns: [{ label: "Name", type: "text" }, { label: "Stage", type: "text" }, { label: "Score", type: "text" }] });
  await invoke("addRows", { table: "deals", rows: [{ name: "One", stage: "Won", score: "42" }, { name: "Two", stage: "Lost", score: "n/a" }] });
  const changed = await invoke("updateColumn", { table: "deals", column: "Stage", type: "select", label: "Deal stage" });
  assert.equal(changed.convertedRows, 2);
  const stage = store.column.find((column) => column.key === "stage");
  assert.equal(stage.label, "Deal stage");
  assert.deepEqual(stage.config.options.map((option) => option.value), ["Won", "Lost"]);
  await invoke("updateColumn", { table: "deals", column: "score", type: "number", config: { aggregate: "avg" }, position: 0 });
  assert.deepEqual(store.row.map((row) => row.values.score), [42, undefined]);
  const columns = (await invoke("describeTable", { table: "deals" })).columns;
  assert.equal(columns[0].key, "score");
  assert.equal(columns[0].config.aggregate, "avg");

  await invoke("removeColumn", { table: "deals", column: "Deal stage" });
  assert.equal(store.column.length, 2);
});

test("listing, paging beyond 500 rows and deleting a table", async () => {
  const { store, invoke } = createStation();
  await invoke("createTable", { name: "Log", columns: [{ label: "N", type: "number" }] });
  await invoke("createTable", { name: "Log", columns: [] });
  const tables = await invoke("listTables", {});
  assert.deepEqual(tables.tables.map((table) => table.key), ["log", "log2"]);
  for (let batch = 0; batch < 3; batch += 1) {
    await invoke("addRows", { table: "log", rows: Array.from({ length: 250 }, (_, index) => ({ n: batch * 250 + index })) });
  }
  const page = await invoke("queryRows", { table: "log", sort: { column: "n", direction: "desc" }, limit: 5, offset: 10 });
  assert.equal(page.total, 750);
  assert.deepEqual(page.rows.map((row) => row.values.n), [739, 738, 737, 736, 735]);
  await assert.rejects(invoke("deleteTable", { table: "log", confirm: false }), /confirm/);
  const deleted = await invoke("deleteTable", { table: "log", confirm: true });
  assert.equal(deleted.rows, 750);
  assert.equal(store.row.length, 0);
  assert.deepEqual(store.table.map((table) => table.key), ["log2"]);
});

test("relations, rollups, formulas, views and page content", async () => {
  const { store, invoke } = createStation();
  await invoke("createTable", { name: "Clients", columns: [{ label: "Name", type: "text", required: true }, { label: "Tier", type: "select", config: { options: ["Gold", "Silver"] } }] });
  await invoke("createTable", {
    name: "Projects",
    itemName: "Project",
    columns: [
      { label: "Title", type: "text", required: true },
      { label: "Client", type: "relation", config: { tableKey: "clients", single: true } },
      { label: "Budget", type: "currency", config: { currency: "EUR" } },
      { label: "Spent", type: "currency", config: { currency: "EUR" } },
      { label: "Remaining", type: "formula", config: { expression: 'prop("Budget") - prop("Spent")', format: "currency" } },
      { label: "Stage", type: "select", config: { options: ["Plan", "Build", "Done"] } },
      { label: "Created", type: "createdTime" },
    ],
  });
  assert.equal(store.view.filter((view) => view.tableKey === "projects").length, 1, "default view");
  const clients = await invoke("addRows", { table: "clients", rows: [{ Name: "Acme", Tier: "Gold" }, { Name: "Globex", Tier: "Silver" }] });
  const projects = await invoke("addRows", {
    table: "projects",
    rows: [
      { values: { Title: "Website", Client: "acme", Budget: 1000, Spent: 1250.5, Stage: "Build" }, body: "# Scope\n- Landing page" },
      { Title: "App", Client: clients.ids[1], Budget: 5000, Spent: 100, Stage: "Plan" },
    ],
  });
  await assert.rejects(invoke("addRows", { table: "projects", rows: [{ Title: "X", Remaining: 3 }] }), /computed/);
  await assert.rejects(invoke("addRows", { table: "projects", rows: [{ Title: "X", Client: "Initech" }] }), /no row “Initech”/);

  await invoke("addColumn", { table: "clients", label: "Projects", type: "relation", config: { tableKey: "projects" } });
  await invoke("updateRows", { table: "clients", updates: [{ id: clients.ids[0], values: { Projects: [projects.ids[0], projects.ids[1]] } }] });
  await invoke("addColumn", { table: "clients", label: "Total budget", type: "rollup", config: { relation: "Projects", property: "Budget", fn: "sum" } });
  await invoke("addColumn", { table: "clients", label: "Project count", type: "rollup", config: { relation: "projects" } });
  await assert.rejects(invoke("addColumn", { table: "clients", label: "Bad", type: "formula", config: { expression: "1 +" } }), /expression/);
  await assert.rejects(invoke("removeColumn", { table: "clients", column: "Projects" }), /rollups/);

  const acme = await invoke("getRow", { table: "clients", id: clients.ids[0] });
  assert.equal(acme.title, "Acme");
  assert.equal(acme.values.totalBudget, 6000);
  assert.equal(acme.values.projectCount, 2);
  assert.deepEqual(acme.values.projects.map((item) => item.title), ["Website", "App"]);

  const website = await invoke("getRow", { table: "projects", id: projects.ids[0] });
  assert.equal(website.values.remaining, -250.5);
  assert.deepEqual(website.values.client, [{ id: clients.ids[0], title: "Acme" }]);
  assert.equal(website.body, "# Scope\n- Landing page");
  assert.match(website.values.created, /^\d{4}-\d{2}-\d{2}$/);

  const over = await invoke("queryRows", { table: "projects", filters: [{ column: "Remaining", op: "lt", value: 0 }] });
  assert.deepEqual(over.rows.map((row) => row.values.title), ["Website"]);
  const byClient = await invoke("queryRows", { table: "projects", filters: [{ column: "Client", op: "contains", value: "globex" }] });
  assert.deepEqual(byClient.rows.map((row) => row.values.title), ["App"]);
  const bodySearch = await invoke("queryRows", { table: "projects", search: "landing" });
  assert.equal(bodySearch.total, 1);

  const board = await invoke("createView", { table: "projects", name: "Pipeline", layout: "board", config: { filters: [{ column: "Stage", op: "neq", value: "Done" }], sorts: [{ column: "Budget", direction: "desc" }] } });
  assert.equal(board.view.config.groupBy, "stage");
  const viewRows = await invoke("queryRows", { table: "projects", view: "Pipeline" });
  assert.deepEqual(viewRows.rows.map((row) => row.values.title), ["App", "Website"]);
  await invoke("updateView", { table: "projects", view: "pipeline", config: { columns: [{ key: "Title" }, { key: "budget", width: 160 }, { key: "spent", hidden: true }], sorts: null } });
  const updated = store.view.find((view) => view.key === "pipeline");
  assert.deepEqual(updated.config.columns, [{ key: "title" }, { key: "budget", width: 160 }, { key: "spent", hidden: true }]);
  assert.equal(updated.config.sorts, undefined);
  await assert.rejects(invoke("createView", { table: "projects", name: "Bad", layout: "board", config: { groupBy: "Budget" } }), /groupBy/);
  await invoke("deleteView", { table: "projects", view: "Pipeline" });
  await assert.rejects(invoke("deleteView", { table: "projects", view: "All" }), /at least one view/);

  await invoke("updateRows", { table: "projects", updates: [{ id: projects.ids[1], body: "Kickoff notes" }] });
  assert.equal((await invoke("getRow", { table: "projects", id: projects.ids[1] })).body, "Kickoff notes");
  const described = await invoke("describeTable", { table: "Projects" });
  assert.deepEqual(described.views.map((view) => view.key), ["all"]);
});
