import { test } from "node:test";
import assert from "node:assert/strict";
import { createComputer, parseFormula, formulaReferences } from "../shared/compute.js";

const col = (key, label, type, config = {}) => ({ key, label, type, config });

function setup() {
  const projects = [
    col("name", "Name", "text"),
    col("budget", "Budget", "currency", { decimals: 2 }),
    col("spent", "Spent", "currency", { decimals: 2 }),
    col("due", "Due", "date"),
    col("status", "Status", "select", { options: [{ value: "todo", label: "To do" }, { value: "done", label: "Done" }] }),
    col("tasks", "Tasks", "relation", { tableKey: "tasks" }),
    col("left", "Left", "formula", { expression: 'prop("Budget") - prop("Spent")' }),
    col("health", "Health", "formula", { expression: 'if(prop("Left") < 0, "Over budget", "OK")' }),
    col("taskCount", "Task count", "rollup", { relation: "tasks", fn: "count" }),
    col("hours", "Hours", "rollup", { relation: "tasks", property: "Hours", fn: "sum" }),
    col("doneShare", "Done", "rollup", { relation: "tasks", property: "Done", fn: "percentChecked" }),
    col("created", "Created", "createdTime"),
  ];
  const tasks = [col("title", "Title", "text"), col("hours", "Hours", "number"), col("done", "Done", "checkbox")];
  const taskRows = new Map([
    ["t1", { id: "t1", values: { title: "Design", hours: 5, done: true } }],
    ["t2", { id: "t2", values: { title: "Build", hours: 12, done: false } }],
  ]);
  const project = { id: "p1", createdAtMs: Date.UTC(2026, 0, 2), values: { name: "Site", budget: 100000, spent: 125050, due: "2026-03-01", status: "done", tasks: ["t1", "t2", "missing"] } };
  const tables = new Map([
    ["projects", { columns: projects, rows: new Map([["p1", project]]) }],
    ["tasks", { columns: tasks, rows: taskRows }],
  ]);
  const computer = createComputer(tables);
  const value = (key) => computer.value("projects", project, projects.find((column) => column.key === key));
  return { computer, value, project, projects };
}

test("formulas use display units, labels and other formulas", () => {
  const { value, computer, project, projects } = setup();
  assert.deepEqual(value("left"), { value: -250.5 });
  assert.deepEqual(value("health"), { value: "Over budget" });
  assert.equal(computer.display("projects", project, projects.find((column) => column.key === "status")), "Done");
  assert.deepEqual(computer.display("projects", project, projects.find((column) => column.key === "tasks")), ["Design", "Build"]);
});

test("rollups and created time", () => {
  const { value } = setup();
  assert.deepEqual(value("taskCount"), { value: 2 });
  assert.deepEqual(value("hours"), { value: 17 });
  assert.deepEqual(value("doneShare"), { value: 50 });
  assert.deepEqual(value("created"), { value: "2026-01-02" });
});

test("formula language", () => {
  const run = (expression, values = {}) => {
    const columns = [col("a", "A", "number"), col("d", "D", "date"), col("t", "T", "text"), col("f", "F", "formula", { expression })];
    const row = { id: "r", values };
    return createComputer(new Map([["x", { columns, rows: new Map([["r", row]]) }]])).value("x", row, columns[3]);
  };
  assert.deepEqual(run("1 + 2 * 3"), { value: 7 });
  assert.deepEqual(run("(1 + 2) * 3"), { value: 9 });
  assert.deepEqual(run("2 ^ 3 ^ 1"), { value: 8 });
  assert.deepEqual(run('"a" + 1'), { value: "a1" });
  assert.deepEqual(run('prop("A") > 3 and not empty(prop("T"))', { a: 5, t: "x" }), { value: true });
  assert.deepEqual(run('prop("A") >= 10 ? "big" : "small"', { a: 5 }), { value: "small" });
  assert.deepEqual(run('dateBetween(prop("D"), "2026-01-01", "days")', { d: "2026-01-31" }), { value: 30 });
  assert.deepEqual(run('formatDate(dateAdd(prop("D"), 1, "months"), "DD.MM.YYYY")', { d: "2026-01-31" }), { value: "03.03.2026" });
  assert.deepEqual(run('round(10 / 3, 2)'), { value: 3.33 });
  assert.deepEqual(run('ifs(prop("A") > 9, "A", prop("A") > 4, "B", "C")', { a: 5 }), { value: "B" });
  assert.deepEqual(run("1 / 0"), { value: null });
  assert.match(run('prop("Nope")').error, /Unknown column/);
  assert.match(run("foo(1)").error, /Unknown function/);
  assert.match(run("1 +").error, /ends unexpectedly/);
  assert.match(run('prop("F")').error, /Circular/);
  assert.deepEqual([...formulaReferences(parseFormula('prop("A") + prop("B")'))], ["A", "B"]);
});
