import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/sidebar.ts", import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const { databaseSidebarItems, tableNavigationId } = exports;
const table = (key, name, lineageCid) => ({ key, name, record: { $: { lineageCid, cid: "current-head" } } });

test("tables are children of the exact Database Room with their own menu actions", () => {
  const tables = [table("companies", "Companies", "lineage-a"), table("tasks", "Tasks", "lineage-b")];
  const items = databaseSidebarItems("room-a", tables, true);
  assert.equal(items[0].kind, "group");
  assert.equal(items.length, 3);
  for (const item of items.slice(1)) {
    assert.equal(item.parentId, items[0].id);
    assert.equal(item.roomId, "room-a");
    assert.deepEqual(Array.from(item.actions, action => action.id), ["table.rename", "table.delete"]);
    assert.equal(item.actions[1].destructive, true);
  }
  assert.notEqual(tableNavigationId("room-a", tables[0]), tableNavigationId("room-b", tables[0]));
});

test("renaming keeps navigation identity; a recreated key has a new identity", () => {
  const original = table("companies", "Companies", "lineage-a");
  assert.equal(tableNavigationId("room-a", original), tableNavigationId("room-a", { ...original, name: "Customers" }));
  assert.notEqual(tableNavigationId("room-a", original), tableNavigationId("room-a", table("companies", "Companies", "replacement")));
});

test("read-only collaborators can navigate tables without write menus", () => {
  const items = databaseSidebarItems("room-a", [table("tasks", "Tasks", "lineage-a")], false);
  assert.equal(items[0].disabled, true);
  assert.equal(items[1].disabled, undefined);
  assert.equal(items[1].actions, undefined);
  assert.equal(databaseSidebarItems(null, [], true).length, 0);
});
