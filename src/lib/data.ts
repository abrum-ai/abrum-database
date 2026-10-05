import React from "react";
import { useAbrumActions, useAbrumInfiniteEntityList, useAbrumMutations } from "@abrum/react";
import { app } from "@abrum/generated";
import type { JsonValue } from "@abrum/web-runtime";
import { createComputer, type ComputeTables } from "../../shared/compute.js";
import { isComputed, normalizeColumn, newRowId, slugKey, uniqueKey, type ColumnConfig, type ColumnDef, type ColumnType, type RelationTitles, type RowValues } from "./columns";
import { DEFAULT_VIEW, normalizeView, type Layout, type ViewConfig, type ViewDef } from "./views";

const PAGE_SIZE = 500;

type EntityName = "table" | "column" | "view" | "row";

/** Every record of an entity (optionally filtered), loading 500 per page until done. */
function useAll<Name extends EntityName>(entity: Name, where?: Record<string, unknown>) {
  // The query hook keys its record projection on option identity: keep the
  // options object stable across renders, or every render yields new rows.
  const whereKey = JSON.stringify(where ?? null);
  const options = React.useMemo(
    () => ({
      ...(where ? { where: where as never } : {}),
      order: ["createdAtMs", "asc"],
      pageSize: PAGE_SIZE,
      realtimeRefreshDelayMs: 150,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [whereKey],
  );
  const query = useAbrumInfiniteEntityList(app, entity, options as never);
  const { hasMore, isLoading, isLoadingMore, loadMore } = query;
  React.useEffect(() => {
    if (hasMore && !isLoading && !isLoadingMore) void loadMore().catch(() => undefined);
  }, [hasMore, isLoading, isLoadingMore, loadMore, query.data.length]);
  return query;
}

export type TableInfo = { key: string; name: string; itemName: string; description?: string; record: unknown };

/** Tables, columns and views of the Room plus schema mutations. */
export function useDatabase() {
  const tables = useAll("table");
  const columns = useAll("column");
  const views = useAll("view");
  const db = useAbrumMutations(app);
  const actions = useAbrumActions(app);

  const tableList = React.useMemo(
    () =>
      [...tables.data]
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || Number(a.createdAtMs) - Number(b.createdAtMs))
        .map((record) => ({ key: record.key, name: record.name, itemName: record.itemName || "Item", description: record.description ?? undefined, record })),
    [tables.data],
  );

  const columnsByTable = React.useMemo(() => {
    const map = new Map<string, Array<{ record: (typeof columns.data)[number]; def: ColumnDef }>>();
    for (const record of columns.data) {
      const list = map.get(record.tableKey) ?? [];
      list.push({ record, def: normalizeColumn({ ...record, type: record.kind }) });
      map.set(record.tableKey, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.def.order - b.def.order);
    return map;
  }, [columns.data]);

  const viewsByTable = React.useMemo(() => {
    const map = new Map<string, Array<{ record: (typeof views.data)[number]; def: ViewDef }>>();
    for (const record of views.data) {
      const list = map.get(record.tableKey) ?? [];
      list.push({ record, def: normalizeView(record) });
      map.set(record.tableKey, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.def.order - b.def.order);
    return map;
  }, [views.data]);

  const columnsFor = React.useCallback((tableKey: string) => (columnsByTable.get(tableKey) ?? []).map((column) => column.def), [columnsByTable]);
  const viewsFor = React.useCallback(
    (tableKey: string): ViewDef[] => {
      const list = (viewsByTable.get(tableKey) ?? []).map((view) => view.def);
      return list.length ? list : [DEFAULT_VIEW];
    },
    [viewsByTable],
  );

  const now = () => Date.now();

  async function createTable(input: { name: string; itemName?: string; columns: Array<{ label: string; type: ColumnType; config?: ColumnConfig; required?: boolean }> }) {
    const stamp = now();
    const key = uniqueKey(slugKey(input.name) || "table", tables.data.map((table) => table.key));
    const order = tables.data.reduce((max, table) => Math.max(max, Number(table.order) || 0), -1) + 1;
    const keys: string[] = [];
    for (const [index, spec] of input.columns.entries()) {
      const columnKey = uniqueKey(slugKey(spec.label), keys);
      keys.push(columnKey);
      await db.column.create({
        tableKey: key, key: columnKey, label: spec.label, kind: spec.type, config: (spec.config ?? {}) as JsonValue, order: index,
        ...(spec.required ? { required: true } : {}), createdAtMs: stamp, updatedAtMs: stamp,
      });
    }
    await db.view.create({ tableKey: key, key: "all", name: "All", layout: "table", config: {}, order: 0, createdAtMs: stamp, updatedAtMs: stamp });
    await db.table.create({ key, name: input.name, order, createdAtMs: stamp, updatedAtMs: stamp, ...(input.itemName ? { itemName: input.itemName } : {}) });
    return key;
  }

  async function updateTable(tableKey: string, patch: { name?: string; itemName?: string; description?: string }) {
    const table = tables.data.find((item) => item.key === tableKey);
    if (table) await db.table.update(table, { ...patch, updatedAtMs: now() });
  }

  async function deleteTable(tableKey: string) {
    // The agent tool deletes rows, columns, views and the table in one signed batch.
    const table = tableList.find(item => item.key === tableKey);
    if (!table) throw new Error("This table is no longer available.");
    const record = table.record as { $: { lineageCid?: string; cid: string } };
    await actions.deleteTable({ table: tableKey, confirm: true, expectedLineageCid: record.$.lineageCid ?? record.$.cid });
  }

  async function addColumn(tableKey: string, input: { label: string; type: ColumnType; config: ColumnConfig; required: boolean }) {
    const existing = columnsFor(tableKey);
    const key = uniqueKey(slugKey(input.label), existing.map((column) => column.key));
    const order = existing.reduce((max, column) => Math.max(max, column.order), -1) + 1;
    const stamp = now();
    await db.column.create({
      tableKey, key, label: input.label, kind: input.type, config: input.config as JsonValue, order,
      ...(input.required ? { required: true } : {}), createdAtMs: stamp, updatedAtMs: stamp,
    });
    return key;
  }

  async function updateColumn(tableKey: string, key: string, patch: Partial<Pick<ColumnDef, "label" | "type" | "config" | "required" | "order">>) {
    const column = (columnsByTable.get(tableKey) ?? []).find((item) => item.def.key === key);
    if (!column) throw new Error(`Column ${key} not found`);
    const { config, type, ...rest } = patch;
    await db.column.update(column.record, { ...rest, ...(type ? { kind: type } : {}), ...(config ? { config: config as JsonValue } : {}), updatedAtMs: now() });
  }

  async function changeColumnType(tableKey: string, key: string, patch: { label: string; type: ColumnType; config: ColumnConfig; required: boolean }) {
    // The backend converts existing values between stored types.
    await actions.updateColumn({ table: tableKey, column: key, label: patch.label, type: patch.type, config: patch.config as JsonValue, required: patch.required });
  }

  async function removeColumn(tableKey: string, key: string) {
    await actions.removeColumn({ table: tableKey, column: key });
  }

  async function createView(tableKey: string, input: { name: string; layout: Layout; config: ViewConfig }) {
    const existing = viewsByTable.get(tableKey) ?? [];
    const stamp = now();
    if (existing.length === 0) {
      // Materialize the implicit default view first so it keeps its place.
      await db.view.create({ tableKey, key: DEFAULT_VIEW.key, name: DEFAULT_VIEW.name, layout: DEFAULT_VIEW.layout, config: {}, order: 0, createdAtMs: stamp, updatedAtMs: stamp });
    }
    const keys = [DEFAULT_VIEW.key, ...existing.map((view) => view.def.key)];
    const key = uniqueKey(slugKey(input.name) || "view", keys);
    const order = existing.reduce((max, view) => Math.max(max, view.def.order), 0) + 1;
    await db.view.create({ tableKey, key, name: input.name, layout: input.layout, config: input.config as JsonValue, order, createdAtMs: stamp + 1, updatedAtMs: stamp + 1 });
    return key;
  }

  async function updateView(tableKey: string, key: string, patch: { name?: string; layout?: Layout; config?: ViewConfig }) {
    const view = (viewsByTable.get(tableKey) ?? []).find((item) => item.def.key === key);
    const { config, ...rest } = patch;
    if (!view) {
      const stamp = now();
      await db.view.create({
        tableKey, key, name: patch.name ?? DEFAULT_VIEW.name, layout: patch.layout ?? DEFAULT_VIEW.layout, config: (config ?? {}) as JsonValue, order: 0,
        createdAtMs: stamp, updatedAtMs: stamp,
      });
      return;
    }
    await db.view.update(view.record, { ...rest, ...(config ? { config: config as JsonValue } : {}), updatedAtMs: now() });
  }

  async function deleteView(tableKey: string, key: string) {
    const view = (viewsByTable.get(tableKey) ?? []).find((item) => item.def.key === key);
    if (view) await db.view.delete(view.record);
  }

  return {
    tables: tableList,
    isLoading: tables.isLoading || columns.isLoading || views.isLoading,
    error: tables.error ?? columns.error ?? views.error,
    columnsFor,
    viewsFor,
    createTable,
    updateTable,
    deleteTable,
    addColumn,
    updateColumn,
    changeColumnType,
    removeColumn,
    createView,
    updateView,
    deleteView,
  };
}

export type Database = ReturnType<typeof useDatabase>;

export type StoredRow = { id: string; values: RowValues; body: string; createdAtMs: number; updatedAtMs: number };

/** Rows of one table, all pages. */
export function useTableRows(tableKey: string) {
  const rows = useAll("row", { tableKey });
  const db = useAbrumMutations(app);
  const actions = useAbrumActions(app);
  const records = React.useMemo(() => rows.data.filter((record) => record.tableKey === tableKey), [rows.data, tableKey]);
  const byId = React.useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);
  const list = React.useMemo<StoredRow[]>(
    () =>
      records.map((record) => ({
        id: record.id,
        values: (record.values && typeof record.values === "object" && !Array.isArray(record.values) ? record.values : {}) as RowValues,
        body: typeof record.body === "string" ? record.body : "",
        createdAtMs: Number(record.createdAtMs) || 0,
        updatedAtMs: Number(record.updatedAtMs) || Number(record.createdAtMs) || 0,
      })),
    [records],
  );

  async function createRow(values: RowValues, body = "") {
    const stamp = Date.now();
    const id = newRowId();
    await db.row.create({ tableKey, id, values: clean(values) as JsonValue, ...(body ? { body } : {}), createdAtMs: stamp, updatedAtMs: stamp });
    return id;
  }

  async function updateRow(id: string, patch: { values?: RowValues; body?: string }) {
    const record = byId.get(id);
    if (!record) throw new Error("This row no longer exists");
    await db.row.update(record, {
      ...(patch.values ? { values: clean(patch.values) as JsonValue } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      updatedAtMs: Date.now(),
    });
  }

  async function deleteRows(ids: string[]) {
    // Large selections go through the backend in signed batches of 500.
    if (ids.length > 25) {
      for (let index = 0; index < ids.length; index += 500) await actions.deleteRows({ table: tableKey, ids: ids.slice(index, index + 500) });
      return;
    }
    const doomed = ids.map((id) => byId.get(id)).filter((record): record is NonNullable<typeof record> => Boolean(record));
    if (doomed.length) await db.row.deleteMany(doomed);
  }

  async function duplicateRow(id: string) {
    const row = list.find((item) => item.id === id);
    if (!row) return null;
    return createRow(row.values, row.body);
  }

  return {
    rows: list,
    isLoading: rows.isLoading,
    isLoadingMore: rows.isLoadingMore || rows.hasMore,
    error: rows.error,
    createRow,
    updateRow,
    deleteRows,
    duplicateRow,
  };
}

export type TableRows = ReturnType<typeof useTableRows>;

function clean(values: RowValues): RowValues {
  const out: RowValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    out[key] = value;
  }
  return out;
}

/** Tables a table needs for relations and rollups (two hops). */
export function relatedTableKeys(tableKey: string, columnsFor: (key: string) => ColumnDef[]): string[] {
  const seen = new Set<string>([tableKey]);
  let frontier = [tableKey];
  for (let depth = 0; depth < 2; depth += 1) {
    const next: string[] = [];
    for (const key of frontier) {
      for (const column of columnsFor(key)) {
        const target = column.type === "relation" ? column.config.tableKey : undefined;
        if (target && !seen.has(target)) {
          seen.add(target);
          next.push(target);
        }
      }
    }
    frontier = next;
  }
  seen.delete(tableKey);
  return [...seen];
}

/** A row as layouts see it: `values` holds cell values (stored + computed). */
export type RowView = StoredRow & { stored: RowValues };

export function useComputedRows(tableKey: string, columns: ColumnDef[], rows: StoredRow[], related: Map<string, StoredRow[]>, columnsFor: (key: string) => ColumnDef[]) {
  return React.useMemo(() => {
    const graph: ComputeTables = new Map();
    graph.set(tableKey, { columns, rows: new Map(rows.map((row) => [row.id, row])) });
    for (const [key, list] of related) graph.set(key, { columns: columnsFor(key), rows: new Map(list.map((row) => [row.id, row])) });
    const computer = createComputer(graph);
    const computedColumns = columns.filter(isComputed);
    const views: RowView[] = rows.map((row) => {
      if (computedColumns.length === 0) return { ...row, stored: row.values };
      const values: RowValues = { ...row.values };
      for (const column of computedColumns) {
        const result = computer.value(tableKey, row, column);
        values[column.key] = result.error !== undefined ? { error: result.error } : result.value;
      }
      return { ...row, values, stored: row.values };
    });
    const titles: RelationTitles = (key, id) => {
      if (!key) return null;
      const row = graph.get(key)?.rows.get(id);
      return row ? computer.titleOf(key, row) : null;
    };
    const titleOf = (row: StoredRow) => computer.titleOf(tableKey, row);
    return { rows: views, titles, titleOf };
  }, [tableKey, columns, rows, related, columnsFor]);
}
