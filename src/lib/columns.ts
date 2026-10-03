// Column model shared by the layouts, the forms and the page sheet.
// Storage rules mirror backend/src/actions.js: twins accept no floats, so
// numbers and currency are stored as integers scaled by 10^decimals.
//
// A "cell value" is what a layout works with: the stored value for ordinary
// columns, and the computed result (display units, JSON-safe) for formulas,
// rollups and created/edited time.

export const COLUMN_TYPES = [
  "text",
  "longText",
  "number",
  "currency",
  "percent",
  "rating",
  "select",
  "multiSelect",
  "person",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "image",
  "trend",
  "relation",
  "rollup",
  "formula",
  "createdTime",
  "editedTime",
] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const TYPE_LABELS: Record<ColumnType, string> = {
  text: "Text",
  longText: "Long text",
  number: "Number",
  currency: "Currency",
  percent: "Percent",
  rating: "Rating",
  select: "Select",
  multiSelect: "Multi-select",
  person: "Person",
  date: "Date",
  checkbox: "Checkbox",
  url: "URL",
  email: "Email",
  phone: "Phone",
  image: "Image",
  trend: "Trend",
  relation: "Relation",
  rollup: "Rollup",
  formula: "Formula",
  createdTime: "Created time",
  editedTime: "Edited time",
};

export const COMPUTED_TYPES: ReadonlySet<ColumnType> = new Set(["rollup", "formula", "createdTime", "editedTime"]);
export const isComputed = (column: ColumnDef) => COMPUTED_TYPES.has(column.type);
export const OPTION_TYPES: ReadonlySet<ColumnType> = new Set(["select", "multiSelect", "person"]);

export const OPTION_COLORS = ["gray", "red", "orange", "amber", "green", "teal", "blue", "indigo", "violet", "pink"] as const;
export type OptionColor = (typeof OPTION_COLORS)[number];

export const ROLLUP_FUNCTIONS = ["count", "countValues", "countUnique", "sum", "avg", "min", "max", "show", "percentChecked", "earliest", "latest"] as const;
export type RollupFunction = (typeof ROLLUP_FUNCTIONS)[number];
export const ROLLUP_LABELS: Record<RollupFunction, string> = {
  count: "Count rows",
  countValues: "Count values",
  countUnique: "Count unique values",
  sum: "Sum",
  avg: "Average",
  min: "Min",
  max: "Max",
  show: "Show values",
  percentChecked: "Percent checked",
  earliest: "Earliest date",
  latest: "Latest date",
};

export const FORMULA_FORMATS = ["number", "currency", "percent", "text", "date", "checkbox"] as const;
export type FormulaFormat = (typeof FORMULA_FORMATS)[number];

export type ColumnOption = { value: string; label?: string; color?: OptionColor; image?: string };
export type Aggregate = "sum" | "avg" | "min" | "max" | "count" | "countEmpty" | "countNotEmpty";

export type ColumnConfig = {
  options?: ColumnOption[];
  currency?: string;
  decimals?: number;
  max?: number;
  section?: string;
  placeholder?: string;
  description?: string;
  aggregate?: Aggregate;
  width?: number;
  tableKey?: string;
  single?: boolean;
  relation?: string;
  property?: string;
  fn?: RollupFunction;
  expression?: string;
  format?: FormulaFormat;
};

export type ColumnDef = {
  key: string;
  label: string;
  type: ColumnType;
  config: ColumnConfig;
  required: boolean;
  order: number;
};

export type RowValues = Record<string, unknown>;
export type ComputedError = { error: string };
export const isComputedError = (value: unknown): value is ComputedError =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value) && typeof (value as ComputedError).error === "string";

/** Resolves relation row ids to titles for display, search and export. */
export type RelationTitles = (tableKey: string | undefined, id: string) => string | null;
export const noTitles: RelationTitles = () => null;

export function normalizeColumn(record: { key: string; label: string; type: string; config?: unknown; required?: boolean | null; order: number }): ColumnDef {
  const type = (COLUMN_TYPES as readonly string[]).includes(record.type) ? (record.type as ColumnType) : "text";
  const config = record.config && typeof record.config === "object" && !Array.isArray(record.config) ? (record.config as ColumnConfig) : {};
  return { key: record.key, label: record.label, type, config, required: record.required === true, order: Number(record.order) || 0 };
}

export function slugKey(value: string): string {
  const words = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  return words.map((word, index) => (index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase())).join("");
}

export function uniqueKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = base || "column";
  if (!used.has(root)) return root;
  for (let index = 2; ; index += 1) if (!used.has(`${root}${index}`)) return `${root}${index}`;
}

export function newRowId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return "r_" + Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

const decimalsOf = (column: ColumnDef) => Math.max(0, Math.min(6, Math.trunc(column.config.decimals ?? (column.type === "currency" ? 2 : 0))));
const scaleOf = (column: ColumnDef) => 10 ** decimalsOf(column);

/** Stored integer → display number for number/currency columns. */
export function toDisplayNumber(column: ColumnDef, stored: unknown): number | null {
  if (typeof stored !== "number" || !Number.isFinite(stored)) return null;
  return column.type === "number" || column.type === "currency" ? stored / scaleOf(column) : stored;
}

/** Display number → stored integer. */
export function toStoredNumber(column: ColumnDef, display: number): number {
  if (column.type === "number" || column.type === "currency") return Math.round(display * scaleOf(column));
  if (column.type === "percent") return Math.max(0, Math.min(100, Math.round(display)));
  if (column.type === "rating") return Math.max(0, Math.min(column.config.max ?? 5, Math.round(display)));
  return Math.round(display);
}

export function optionFor(column: ColumnDef, value: unknown): ColumnOption | undefined {
  return column.config.options?.find((option) => option.value === value);
}

export function optionLabel(column: ColumnDef, value: unknown): string {
  const option = optionFor(column, value);
  return option?.label ?? option?.value ?? String(value ?? "");
}

export function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

/** How a computed value should be presented. */
export function computedFormat(column: ColumnDef, value: unknown): FormulaFormat {
  if (column.type === "createdTime" || column.type === "editedTime") return "date";
  if (column.config.format) return column.config.format;
  if (column.type === "rollup" && column.config.fn === "percentChecked") return "percent";
  if (column.type === "rollup" && (column.config.fn === "earliest" || column.config.fn === "latest")) return "date";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
  return "text";
}

export function formatPlainNumber(value: number, decimals?: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals ?? (Number.isInteger(value) ? 0 : 2) });
}

export function formatCurrency(value: number, currency = "EUR", decimals = 2) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return formatPlainNumber(value, decimals);
  }
}

export function formatNumber(column: ColumnDef, stored: unknown): string {
  const value = toDisplayNumber(column, stored);
  if (value === null) return "";
  return column.type === "currency" ? formatCurrency(value, column.config.currency, decimalsOf(column)) : formatPlainNumber(value, decimalsOf(column));
}

export function formatDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return String(value ?? "");
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Text of a computed cell value. */
export function computedText(column: ColumnDef, value: unknown): string {
  if (isComputedError(value)) return `⚠ ${value.error}`;
  if (isEmpty(value)) return "";
  const format = computedFormat(column, value);
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (format === "date") return formatDate(value);
  if (format === "checkbox") return value === true ? "Yes" : "No";
  if (typeof value === "number") {
    if (format === "currency") return formatCurrency(value, column.config.currency, column.config.decimals ?? 2);
    if (format === "percent") return `${formatPlainNumber(value, column.config.decimals)}%`;
    return formatPlainNumber(value, column.config.decimals);
  }
  return String(value);
}

/** Plain text for search, export and copy. */
export function textValue(column: ColumnDef, value: unknown, titles: RelationTitles = noTitles): string {
  if (isComputed(column)) return computedText(column, value);
  if (isEmpty(value)) return "";
  switch (column.type) {
    case "number":
    case "currency": {
      const number = toDisplayNumber(column, value);
      return number === null ? "" : String(number);
    }
    case "select":
    case "person":
      return optionLabel(column, value);
    case "multiSelect":
      return Array.isArray(value) ? value.map((item) => optionLabel(column, item)).join(", ") : "";
    case "relation":
      return Array.isArray(value) ? value.map((id) => titles(column.config.tableKey, String(id)) ?? "").filter(Boolean).join(", ") : "";
    case "checkbox":
      return value === true ? "Yes" : "No";
    case "trend":
      return Array.isArray(value) ? value.join(" ") : "";
    default:
      return String(value);
  }
}

/** Value used by sorting. */
export function sortValue(column: ColumnDef, value: unknown, titles: RelationTitles = noTitles): string | number {
  if (isComputedError(value) || isEmpty(value)) return column.type === "date" ? "" : Number.NEGATIVE_INFINITY;
  if (isComputed(column)) {
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    return computedText(column, value).toLowerCase();
  }
  switch (column.type) {
    case "number":
    case "currency":
    case "percent":
    case "rating":
      return typeof value === "number" ? value : Number.NEGATIVE_INFINITY;
    case "checkbox":
      return value === true ? 1 : 0;
    case "trend":
      return Array.isArray(value) ? value.reduce((sum: number, item) => sum + (Number(item) || 0), 0) : 0;
    case "date":
      return String(value);
    case "select":
    case "person": {
      // Option order is the meaningful order (e.g. pipeline stages).
      const index = column.config.options?.findIndex((option) => option.value === value) ?? -1;
      return index >= 0 ? index : textValue(column, value).toLowerCase();
    }
    default:
      return textValue(column, value, titles).toLowerCase();
  }
}

export function validateValues(columns: ColumnDef[], values: RowValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const column of columns) {
    if (isComputed(column)) continue;
    const value = values[column.key];
    if (column.required && isEmpty(value) && column.type !== "checkbox") errors[column.key] = `${column.label} is required`;
    else if (column.type === "email" && typeof value === "string" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors[column.key] = "Enter a valid email address";
    } else if (column.type === "url" && typeof value === "string" && value && !/^https?:\/\//i.test(value)) {
      errors[column.key] = "URLs start with http:// or https://";
    }
  }
  return errors;
}

/** Primary column: the first text column, used as the row title. */
export function primaryColumn(columns: ColumnDef[]): ColumnDef | undefined {
  return columns.find((column) => column.type === "text") ?? columns.find((column) => !isComputed(column) && column.type !== "image") ?? columns[0];
}

export function imageColumn(columns: ColumnDef[]): ColumnDef | undefined {
  return columns.find((column) => column.type === "image");
}

// ---- Filtering -------------------------------------------------------------

export type FilterOp = "contains" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "empty" | "notEmpty";
export type RowFilter = { column: string; op: FilterOp; value?: string | number | boolean };

export const FILTER_OPS: Record<FilterOp, string> = {
  contains: "contains",
  eq: "is",
  neq: "is not",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  empty: "is empty",
  notEmpty: "is not empty",
};

export function opsFor(column: ColumnDef): FilterOp[] {
  if (isComputed(column)) return ["contains", "eq", "gt", "lt", "empty", "notEmpty"];
  switch (column.type) {
    case "number":
    case "currency":
    case "percent":
    case "rating":
    case "date":
      return ["eq", "gt", "gte", "lt", "lte", "empty", "notEmpty"];
    case "select":
    case "person":
    case "checkbox":
      return ["eq", "neq", "empty", "notEmpty"];
    case "multiSelect":
    case "relation":
      return ["contains", "empty", "notEmpty"];
    default:
      return ["contains", "eq", "neq", "empty", "notEmpty"];
  }
}

function matchesOption(column: ColumnDef, value: unknown, target: string) {
  const wanted = target.toLowerCase();
  return String(value).toLowerCase() === wanted || optionLabel(column, value).toLowerCase() === wanted;
}

export function matchesFilter(column: ColumnDef, value: unknown, filter: RowFilter, titles: RelationTitles = noTitles): boolean {
  if (filter.op === "empty") return isEmpty(value) || isComputedError(value);
  if (filter.op === "notEmpty") return !isEmpty(value) && !isComputedError(value);
  if (filter.value === undefined || filter.value === "") return true;
  if (isComputedError(value)) return false;
  const target = String(filter.value);
  const numeric = ["number", "currency", "percent", "rating"].includes(column.type) || (isComputed(column) && typeof value === "number");
  if (numeric) {
    const number = isComputed(column) ? (typeof value === "number" ? value : null) : toDisplayNumber(column, value);
    const wanted = Number(target);
    if (number === null || !Number.isFinite(wanted)) return false;
    return compareOp(filter.op, number, wanted);
  }
  if (column.type === "date" || (isComputed(column) && computedFormat(column, value) === "date")) {
    const date = typeof value === "string" ? value.slice(0, 10) : "";
    return Boolean(date) && compareOp(filter.op, date, target.slice(0, 10));
  }
  switch (column.type) {
    case "checkbox": {
      const wanted = target === "true";
      return filter.op === "neq" ? (value === true) !== wanted : (value === true) === wanted;
    }
    case "select":
    case "person":
      return filter.op === "neq" ? !matchesOption(column, value, target) : matchesOption(column, value, target);
    case "multiSelect":
      return Array.isArray(value) && value.some((item) => matchesOption(column, item, target));
    case "relation":
      return Array.isArray(value) && value.some((id) => id === target || (titles(column.config.tableKey, String(id)) ?? "").toLowerCase().includes(target.toLowerCase()));
    default: {
      const text = textValue(column, value, titles).toLowerCase();
      const wanted = target.toLowerCase();
      if (filter.op === "eq") return text === wanted;
      if (filter.op === "neq") return text !== wanted;
      return text.includes(wanted);
    }
  }
}

function compareOp(op: FilterOp, left: number | string, right: number | string) {
  switch (op) {
    case "gt": return left > right;
    case "gte": return left >= right;
    case "lt": return left < right;
    case "lte": return left <= right;
    case "neq": return left !== right;
    default: return left === right;
  }
}

// ---- Aggregates ------------------------------------------------------------

export const AGGREGATE_LABELS: Record<Aggregate, string> = {
  count: "Count",
  countEmpty: "Empty",
  countNotEmpty: "Not empty",
  sum: "Sum",
  avg: "Average",
  min: "Min",
  max: "Max",
};

export function aggregatesFor(column: ColumnDef): Aggregate[] {
  const numeric = ["number", "currency", "percent", "rating"].includes(column.type) || column.type === "formula" || column.type === "rollup";
  return numeric ? ["count", "countEmpty", "countNotEmpty", "sum", "avg", "min", "max"] : ["count", "countEmpty", "countNotEmpty"];
}

export function aggregate(column: ColumnDef, values: unknown[], kind: Aggregate | undefined = column.config.aggregate): string | null {
  if (!kind) return null;
  if (kind === "count") return values.length.toLocaleString();
  if (kind === "countEmpty") return values.filter((value) => isEmpty(value)).length.toLocaleString();
  if (kind === "countNotEmpty") return values.filter((value) => !isEmpty(value)).length.toLocaleString();
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return "–";
  const result =
    kind === "sum"
      ? numbers.reduce((sum, value) => sum + value, 0)
      : kind === "avg"
        ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
        : kind === "min"
          ? Math.min(...numbers)
          : Math.max(...numbers);
  if (column.type === "percent") return `${Math.round(result)}%`;
  if (isComputed(column)) return computedText(column, kind === "avg" ? Math.round(result * 100) / 100 : result);
  return formatNumber(column, Math.round(result));
}

// ---- Export ----------------------------------------------------------------

export function toCsv(columns: ColumnDef[], rows: RowValues[], titles: RelationTitles = noTitles): string {
  const escape = (value: string) => (/[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const header = columns.map((column) => escape(column.label)).join(",");
  const lines = rows.map((row) => columns.map((column) => escape(textValue(column, row[column.key], titles))).join(","));
  return [header, ...lines].join("\n");
}

export function toJsonRows(columns: ColumnDef[], rows: Array<{ id: string; values: RowValues; body?: string }>, titles: RelationTitles = noTitles): unknown[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = { id: row.id };
    for (const column of columns) {
      const value = row.values[column.key];
      if (column.type === "number" || column.type === "currency") out[column.key] = toDisplayNumber(column, value);
      else if (column.type === "relation") out[column.key] = Array.isArray(value) ? value.map((id) => ({ id, title: titles(column.config.tableKey, String(id)) })) : [];
      else out[column.key] = value ?? null;
    }
    if (row.body) out.body = row.body;
    return out;
  });
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** RFC 4180 CSV parser (quotes, escaped quotes, CRLF, separators , or ;). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const separator = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}
