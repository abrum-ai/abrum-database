// Live integration tests against a real ABRUM Station with abrum.table
// installed. Every call goes through the signed /api/apps/run path and the
// Station's station-js runtime, exactly like an agent tool call.
//
//   TABLE_QA_STATION=http://127.0.0.1:8892 TABLE_QA_ROOM=room-… \
//   TABLE_QA_PHRASE_FILE=/path/to/test-identity ABRUM_REPO=../abrum \
//   node --test qa/live.test.mjs
//
// Use a dedicated test identity and Room: the suite creates and deletes data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stationClient } from "./station-client.mjs";

const station = process.env.TABLE_QA_STATION;
const room = process.env.TABLE_QA_ROOM;
const phraseFile = process.env.TABLE_QA_PHRASE_FILE;
const enabled = Boolean(station && room && phraseFile);
const run = enabled ? test : test.skip;

const client = enabled
  ? await stationClient({ url: station, phrase: readFileSync(phraseFile, "utf8").trim(), abrumRepo: path.resolve(process.env.ABRUM_REPO ?? "../abrum") })
  : null;

const suffix = Date.now().toString(36);
async function call(fn, input = {}) {
  const result = await client.post("/api/apps/run", { room_id: room, app_id: "abrum.table", function: fn, input });
  const { stationTiming, effectResources, ...data } = result.data ?? {};
  return data;
}

run("CRM: companies and contacts with relations, rollups and a pipeline board", async () => {
  const companies = await call("createTable", {
    name: `Companies ${suffix}`,
    itemName: "Company",
    columns: [
      { label: "Name", type: "text", required: true },
      { label: "Stage", type: "select", config: { options: [{ value: "Lead", color: "gray" }, { value: "Pilot", color: "orange" }, { value: "Customer", color: "green" }] } },
      { label: "ARR", type: "currency", config: { currency: "EUR", aggregate: "sum" } },
      { label: "Website", type: "url" },
    ],
  });
  const contacts = await call("createTable", {
    name: `Contacts ${suffix}`,
    itemName: "Contact",
    columns: [
      { label: "Name", type: "text", required: true },
      { label: "Email", type: "email" },
      { label: "Company", type: "relation", config: { tableKey: companies.key, single: true } },
    ],
  });
  const added = await call("addRows", {
    table: companies.key,
    rows: [
      { Name: "Acme", Stage: "Customer", ARR: 120000, Website: "acme.example" },
      { Name: "Globex", Stage: "pilot", ARR: 24000.5 },
      { Name: "Initech", Stage: "Lead" },
    ],
  });
  assert.equal(added.ids.length, 3);
  await call("addRows", {
    table: contacts.key,
    rows: [
      { Name: "Ada", Email: "ada@acme.example", Company: "Acme" },
      { Name: "Bob", Email: "bob@acme.example", Company: "acme" },
      { Name: "Cleo", Company: "Globex" },
    ],
  });
  await call("addColumn", { table: companies.key, label: "Contacts", type: "relation", config: { tableKey: contacts.key } });
  const contactRows = await call("queryRows", { table: contacts.key, limit: 10 });
  const byName = Object.fromEntries(contactRows.rows.map((row) => [row.values.name, row.id]));
  await call("updateRows", {
    table: companies.key,
    updates: [
      { id: added.ids[0], values: { Contacts: [byName.Ada, byName.Bob] } },
      { id: added.ids[1], values: { Contacts: ["Cleo"] } },
    ],
  });
  await call("addColumn", { table: companies.key, label: "Contact count", type: "rollup", config: { relation: "Contacts", fn: "count" } });

  const acme = await call("getRow", { table: companies.key, id: added.ids[0] });
  assert.equal(acme.values.arr, 120000);
  assert.equal(acme.values.website, "https://acme.example");
  assert.equal(acme.values.contactCount, 2);
  assert.deepEqual(acme.values.contacts.map((item) => item.title).sort(), ["Ada", "Bob"]);

  const board = await call("createView", { table: companies.key, name: "Pipeline", layout: "board", config: { filters: [{ column: "Stage", op: "neq", value: "Lead" }], sorts: [{ column: "ARR", direction: "desc" }] } });
  assert.equal(board.view.config.groupBy, "stage");
  const pipeline = await call("queryRows", { table: companies.key, view: "Pipeline" });
  assert.deepEqual(pipeline.rows.map((row) => row.values.name), ["Acme", "Globex"]);
  assert.equal(pipeline.rows[1].values.arr, 24000.5);

  const described = await call("describeTable", { table: companies.key });
  assert.deepEqual(described.views.map((view) => view.key), ["all", "pipeline"]);
  assert.equal(described.rows, 3);

  await call("deleteTable", { table: contacts.key, confirm: true });
  await call("deleteTable", { table: companies.key, confirm: true });
});

run("Projects: tasks with progress rollups, date formulas and page content", async () => {
  const projects = await call("createTable", { name: `Projects ${suffix}`, itemName: "Project", columns: [{ label: "Title", type: "text", required: true }, { label: "Due", type: "date" }] });
  const tasks = await call("createTable", {
    name: `Tasks ${suffix}`,
    itemName: "Task",
    columns: [
      { label: "Task", type: "text", required: true },
      { label: "Done", type: "checkbox" },
      { label: "Hours", type: "number", config: { decimals: 1 } },
      { label: "Project", type: "relation", config: { tableKey: projects.key, single: true } },
    ],
  });
  const project = await call("addRows", { table: projects.key, rows: [{ values: { Title: "Relaunch", Due: "2026-12-01" }, body: "## Goal\nShip the new site." }] });
  const taskIds = (await call("addRows", {
    table: tasks.key,
    rows: [
      { Task: "Design", Done: true, Hours: 6.5, Project: "Relaunch" },
      { Task: "Build", Done: false, Hours: 20, Project: "Relaunch" },
      { Task: "Test", Done: true, Hours: 3.5, Project: "Relaunch" },
      { Task: "Launch", Done: false, Project: "Relaunch" },
    ],
  })).ids;
  await call("addColumn", { table: projects.key, label: "Tasks", type: "relation", config: { tableKey: tasks.key } });
  await call("updateRows", { table: projects.key, updates: [{ id: project.ids[0], values: { Tasks: taskIds } }] });
  await call("addColumn", { table: projects.key, label: "Progress", type: "rollup", config: { relation: "Tasks", property: "Done", fn: "percentChecked" } });
  await call("addColumn", { table: projects.key, label: "Effort", type: "rollup", config: { relation: "Tasks", property: "Hours", fn: "sum" } });
  await call("addColumn", { table: projects.key, label: "Days left", type: "formula", config: { expression: 'dateBetween(prop("Due"), "2026-10-01", "days")' } });
  await call("addColumn", { table: projects.key, label: "Status", type: "formula", config: { expression: 'if(prop("Progress") == 100, "Done", concat(format(prop("Progress")), "% · ", format(prop("Effort")), " h"))' } });

  const row = await call("getRow", { table: projects.key, id: project.ids[0] });
  assert.equal(row.values.progress, 50);
  assert.equal(row.values.effort, 30);
  assert.equal(row.values.daysLeft, 61);
  assert.equal(row.values.status, "50% · 30 h");
  assert.equal(row.body, "## Goal\nShip the new site.");
  assert.match(String((await call("queryRows", { table: projects.key, search: "new site", includeBody: true })).rows[0]?.body), /Ship/);

  await call("updateRows", { table: tasks.key, updates: [{ id: taskIds[1], values: { Done: true } }, { id: taskIds[3], values: { Done: true } }] });
  assert.equal((await call("getRow", { table: projects.key, id: project.ids[0] })).values.status, "Done");

  const open = await call("queryRows", { table: tasks.key, filters: [{ column: "Hours", op: "gte", value: 6 }], sort: { column: "Hours", direction: "desc" } });
  assert.deepEqual(open.rows.map((item) => item.values.task), ["Build", "Design"]);

  await call("deleteTable", { table: tasks.key, confirm: true });
  await call("deleteTable", { table: projects.key, confirm: true });
});

run("Inventory: 1,200 items across Station pages, formulas and bulk delete", async () => {
  const products = await call("createTable", {
    name: `Inventory ${suffix}`,
    itemName: "Product",
    columns: [
      { label: "SKU", type: "text", required: true },
      { label: "Stock", type: "number" },
      { label: "Price", type: "currency", config: { currency: "EUR" } },
      { label: "Value", type: "formula", config: { expression: 'prop("Stock") * prop("Price")', format: "currency" } },
    ],
  });
  const ids = [];
  for (let batch = 0; batch < 3; batch += 1) {
    const rows = Array.from({ length: 400 }, (_, index) => {
      const n = batch * 400 + index;
      return { SKU: `SKU-${String(n).padStart(4, "0")}`, Stock: n % 50, Price: 9.99 };
    });
    ids.push(...(await call("addRows", { table: products.key, rows })).ids);
  }
  const all = await call("queryRows", { table: products.key, limit: 1 });
  assert.equal(all.total, 1200, "rows beyond one 500-row Station page are read");

  const low = await call("queryRows", { table: products.key, filters: [{ column: "Stock", op: "lt", value: 2 }], limit: 500 });
  assert.equal(low.total, 48);
  const top = await call("queryRows", { table: products.key, sort: { column: "Value", direction: "desc" }, limit: 1 });
  assert.equal(top.rows[0].values.stock, 49);
  assert.equal(Math.round(top.rows[0].values.value * 100), 48951);

  const lastPage = await call("queryRows", { table: products.key, sort: { column: "SKU", direction: "asc" }, offset: 1195, limit: 10 });
  assert.deepEqual(lastPage.rows.map((row) => row.values.sku), ["SKU-1195", "SKU-1196", "SKU-1197", "SKU-1198", "SKU-1199"]);

  const deleted = await call("deleteRows", { table: products.key, ids: ids.slice(0, 500) });
  assert.equal(deleted.deleted.length, 500);
  assert.equal((await call("describeTable", { table: products.key })).rows, 700);
  await call("deleteTable", { table: products.key, confirm: true });
});

run("Content calendar: schema evolution, type conversion and gallery views", async () => {
  const posts = await call("createTable", {
    name: `Content ${suffix}`,
    itemName: "Post",
    columns: [
      { label: "Title", type: "text", required: true },
      { label: "Status", type: "text" },
      { label: "Publish", type: "date" },
      { label: "Score", type: "text" },
    ],
  });
  await call("addRows", {
    table: posts.key,
    rows: [
      { Title: "Launch post", Status: "Draft", Publish: "2026-10-10", Score: "8" },
      { Title: "Case study", Status: "Published", Publish: "2026-09-20", Score: "n/a" },
      { Title: "Newsletter", Status: "Draft" },
    ],
  });
  const converted = await call("updateColumn", { table: posts.key, column: "Status", type: "select" });
  assert.equal(converted.convertedRows, 3);
  await call("updateColumn", { table: posts.key, column: "Score", type: "number", label: "Rating" });
  await call("addColumn", { table: posts.key, label: "Channels", type: "multiSelect", config: { options: ["Blog", "LinkedIn", "Mail"] }, position: 1 });
  await call("addColumn", { table: posts.key, label: "Cover", type: "image" });
  const rows = (await call("queryRows", { table: posts.key })).rows;
  await call("updateRows", {
    table: posts.key,
    updates: [
      { id: rows[0].id, values: { Channels: ["Blog", "LinkedIn"], Cover: "https://images.example/launch.png" } },
      { id: rows[2].id, values: { Channels: "Mail, Podcast" } },
    ],
  });
  const schema = await call("describeTable", { table: posts.key });
  assert.deepEqual(schema.columns.map((column) => column.key), ["title", "channels", "status", "publish", "score", "cover"]);
  assert.deepEqual(schema.columns.find((column) => column.key === "status").config.options.map((option) => option.value), ["Draft", "Published"]);
  assert.ok(schema.columns.find((column) => column.key === "channels").config.options.some((option) => option.value === "Podcast"), "new option added on write");
  assert.equal(schema.columns.find((column) => column.key === "score").label, "Rating");

  const ratings = (await call("queryRows", { table: posts.key, sort: { column: "Rating", direction: "desc" } })).rows.map((row) => row.values.score ?? null);
  assert.deepEqual(ratings, [8, null, null]);

  await call("createView", { table: posts.key, name: "Gallery", layout: "gallery", config: { cover: "Cover", cardColumns: ["Status", "Publish"] } });
  await call("createView", { table: posts.key, name: "Drafts", layout: "list", config: { filters: [{ column: "Status", op: "eq", value: "Draft" }] } });
  assert.equal((await call("queryRows", { table: posts.key, view: "Drafts" })).total, 2);
  await assert.rejects(call("createView", { table: posts.key, name: "Bad", layout: "gallery", config: { cover: "Title" } }), /cover needs an image column/);
  await assert.rejects(call("addRows", { table: posts.key, rows: [{ Status: "Draft" }] }), /Title is required/);
  await call("deleteTable", { table: posts.key, confirm: true });
});
