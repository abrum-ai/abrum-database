import type { ColumnDef, RowFilter } from "./columns";

export const LAYOUTS = ["table", "board", "gallery", "list"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const LAYOUT_LABELS: Record<Layout, string> = { table: "Table", board: "Board", gallery: "Gallery", list: "List" };

export type ViewSort = { column: string; direction: "asc" | "desc" };
export type ViewColumn = { key: string; hidden?: boolean; width?: number };

export type ViewConfig = {
  filters?: RowFilter[];
  filterMode?: "and" | "or";
  sorts?: ViewSort[];
  columns?: ViewColumn[];
  groupBy?: string;
  cover?: string;
  cardColumns?: string[];
  wrap?: boolean;
};

export type ViewDef = {
  key: string;
  name: string;
  layout: Layout;
  config: ViewConfig;
  order: number;
  /** False for the implicit default view of a table that has no saved views yet. */
  persisted: boolean;
};

export const DEFAULT_VIEW: ViewDef = { key: "all", name: "All", layout: "table", config: {}, order: 0, persisted: false };

export function normalizeView(record: { key: string; name: string; layout: string; config?: unknown; order: number }): ViewDef {
  const layout = (LAYOUTS as readonly string[]).includes(record.layout) ? (record.layout as Layout) : "table";
  const config = record.config && typeof record.config === "object" && !Array.isArray(record.config) ? (record.config as ViewConfig) : {};
  return { key: record.key, name: record.name, layout, config, order: Number(record.order) || 0, persisted: true };
}

/** Columns in view order with widths; hidden columns excluded unless asked. */
export function viewColumns(view: ViewDef, columns: ColumnDef[], includeHidden = false): Array<ColumnDef & { width?: number; hidden: boolean }> {
  const settings = new Map((view.config.columns ?? []).map((entry, index) => [entry.key, { ...entry, index }]));
  const ordered = [...columns].sort((a, b) => {
    const left = settings.get(a.key)?.index ?? Number.MAX_SAFE_INTEGER;
    const right = settings.get(b.key)?.index ?? Number.MAX_SAFE_INTEGER;
    return left - right || a.order - b.order;
  });
  return ordered
    .map((column) => ({ ...column, width: settings.get(column.key)?.width ?? column.config.width, hidden: settings.get(column.key)?.hidden === true }))
    .filter((column) => includeHidden || !column.hidden);
}

/** Rewrite the per-view column list after reorder / resize / visibility changes. */
export function withColumnSettings(view: ViewDef, columns: ColumnDef[], update: (list: ViewColumn[]) => ViewColumn[]): ViewConfig {
  const list = viewColumns(view, columns, true).map((column) => ({
    key: column.key,
    ...(column.hidden ? { hidden: true } : {}),
    ...(column.width ? { width: column.width } : {}),
  }));
  return { ...view.config, columns: update(list) };
}
