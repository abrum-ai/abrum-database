import React from "react";
import { useAbrumCollection } from "@abrum/react";
import { app } from "@abrum/generated";
import type { JsonValue } from "@abrum/web-runtime";
import { normalizeColumn, newRowId, slugKey, uniqueKey, type ColumnConfig, type ColumnDef, type ColumnType, type RowValues } from "./columns";

export const ROW_LIMIT = 2000;

/** All twins of the app plus the mutations the UI needs. */
export function useTables() {
  const tables = useAbrumCollection(app, "table", { order: ["createdAtMs", "asc"], limit: 200 });
  const columns = useAbrumCollection(app, "column", { limit: 1000 });
  const sortedTables = React.useMemo(
    () => [...tables.data].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || Number(a.createdAtMs) - Number(b.createdAtMs)),
    [tables.data],
  );

  const columnsFor = React.useCallback(
    (tableKey: string) =>
      columns.data
        .filter((record) => record.tableKey === tableKey)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
        .map((record) => ({ record, def: normalizeColumn({ ...record, required: record.required === true, hidden: record.hidden === true }) })),
    [columns.data],
  );

  async function createTable(input: { name: string; itemName?: string; columns: Array<{ label: string; type: ColumnType; config?: ColumnConfig; required?: boolean }> }) {
    const now = Date.now();
    const key = uniqueKey(slugKey(input.name) || "table", tables.data.map((table) => table.key));
    const order = tables.data.reduce((max, table) => Math.max(max, Number(table.order) || 0), -1) + 1;
    await tables.create({ key, name: input.name, order, createdAtMs: now, updatedAtMs: now, ...(input.itemName ? { itemName: input.itemName } : {}) });
    const keys: string[] = [];
    for (const [index, spec] of input.columns.entries()) {
      const columnKey = uniqueKey(slugKey(spec.label), keys);
      keys.push(columnKey);
      await columns.create({
        tableKey: key, key: columnKey, label: spec.label, type: spec.type, config: spec.config ?? {}, order: index,
        ...(spec.required ? { required: true } : {}), createdAtMs: now, updatedAtMs: now,
      });
    }
    return { key, columnKeys: keys };
  }

  async function addColumn(tableKey: string, input: { label: string; type: ColumnType; config: ColumnConfig; required: boolean }) {
    const existing = columnsFor(tableKey);
    const now = Date.now();
    const key = uniqueKey(slugKey(input.label), existing.map((column) => column.def.key));
    const order = existing.reduce((max, column) => Math.max(max, column.def.order), -1) + 1;
    await columns.create({
      tableKey, key, label: input.label, type: input.type, config: input.config, order,
      ...(input.required ? { required: true } : {}), createdAtMs: now, updatedAtMs: now,
    });
    return key;
  }

  async function updateColumn(tableKey: string, key: string, patch: Partial<Pick<ColumnDef, "label" | "type" | "config" | "required" | "hidden" | "order">>) {
    const column = columnsFor(tableKey).find((item) => item.def.key === key);
    if (!column) throw new Error(`Column ${key} not found`);
    await columns.update(column.record, { ...patch, updatedAtMs: Date.now() });
  }

  async function removeColumn(tableKey: string, key: string) {
    const column = columnsFor(tableKey).find((item) => item.def.key === key);
    if (column) await columns.remove(column.record);
  }

  async function renameTable(tableKey: string, name: string) {
    const table = tables.data.find((item) => item.key === tableKey);
    if (table) await tables.update(table, { name, updatedAtMs: Date.now() });
  }

  async function deleteTable(tableKey: string, rows: Array<{ remove: () => Promise<unknown> }>) {
    for (const row of rows) await row.remove();
    for (const column of columnsFor(tableKey)) await columns.remove(column.record);
    const table = tables.data.find((item) => item.key === tableKey);
    if (table) await tables.remove(table);
  }

  return {
    tables: sortedTables,
    isLoading: tables.isLoading || columns.isLoading,
    error: tables.error ?? columns.error,
    columnsFor,
    createTable,
    addColumn,
    updateColumn,
    removeColumn,
    renameTable,
    deleteTable,
  };
}

export type TableRow = { id: string; values: RowValues; createdAtMs: number; remove: () => Promise<unknown> };

/** Rows of one table. */
export function useRows(tableKey: string | null) {
  const rows = useAbrumCollection(app, "row", {
    where: { tableKey: tableKey ?? "" },
    order: ["createdAtMs", "asc"],
    limit: ROW_LIMIT,
  });
  const byId = React.useMemo(() => new Map(rows.data.map((record) => [record.id, record])), [rows.data]);
  const list = React.useMemo<TableRow[]>(
    () =>
      rows.data
        .filter((record) => record.tableKey === tableKey)
        .map((record) => ({
          id: record.id,
          values: (record.values && typeof record.values === "object" ? record.values : {}) as RowValues,
          createdAtMs: Number(record.createdAtMs) || 0,
          remove: () => rows.remove(record),
        })),
    [rows, tableKey],
  );

  async function createRow(values: RowValues) {
    if (!tableKey) return null;
    const now = Date.now();
    const id = newRowId();
    await rows.create({ tableKey, id, values: clean(values) as JsonValue, createdAtMs: now, updatedAtMs: now });
    return id;
  }

  async function updateRow(id: string, values: RowValues) {
    const record = byId.get(id);
    if (!record) throw new Error("Row no longer exists");
    await rows.update(record, { values: clean(values) as JsonValue, updatedAtMs: Date.now() });
  }

  async function deleteRows(ids: string[]) {
    for (const id of ids) {
      const record = byId.get(id);
      if (record) await rows.remove(record);
    }
  }

  return { rows: list, isLoading: rows.isLoading, error: rows.error, isMutating: rows.isMutating, createRow, updateRow, deleteRows };
}

function clean(values: RowValues): RowValues {
  const out: RowValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    out[key] = value;
  }
  return out;
}
