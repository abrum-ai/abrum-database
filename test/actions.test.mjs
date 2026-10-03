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

function createStation() {
  const store = { table: [], column: [], row: [] };
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
            store[entity].push({ ...structuredClone(value), $: { cid: `c${seq}`, lineageCid: `l${seq}` } });
          });
          return value;
        },
        update: (record, patch) => {
          pending.push(() => {
            const index = store[entity].findIndex((item) => item.$.lineageCid === record.$.lineageCid);
            assert.ok(index >= 0, "update of a missing record");
            seq += 1;
            store[entity][index] = { ...store[entity][index], ...structuredClone(patch), $: { cid: `c${seq}`, lineageCid: record.$.lineageCid } };
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
