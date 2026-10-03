// Column model shared by the table, the add-item modal and the details sheet.
// Storage rules mirror backend/actions.js: twins accept no floats, so numbers
// and currency are stored as integers scaled by 10^decimals.

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
};

export const OPTION_COLORS = ["gray", "red", "orange", "amber", "green", "teal", "blue", "indigo", "violet", "pink"] as const;
export type OptionColor = (typeof OPTION_COLORS)[number];

export type ColumnOption = { value: string; label?: string; color?: OptionColor; image?: string };
export type Aggregate = "sum" | "avg" | "min" | "max" | "count";

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
};

export type ColumnDef = {
  key: string;
  label: string;
  type: ColumnType;
  config: ColumnConfig;
  required: boolean;
  hidden: boolean;
  order: number;
};

export type RowValues = Record<string, unknown>;

export function normalizeColumn(record: {
  key: string;
  label: string;
  type: string;
  config?: unknown;
  required?: boolean;
  hidden?: boolean;
  order: number;
}): ColumnDef {
  const type = (COLUMN_TYPES as readonly string[]).includes(record.type) ? (record.type as ColumnType) : "text";
  const config = record.config && typeof record.config === "object" && !Array.isArray(record.config) ? (record.config as ColumnConfig) : {};
  return {
    key: record.key,
    label: record.label,
    type,
    config,
    required: record.required === true,
    hidden: record.hidden === true,
    order: Number(record.order) || 0,
  };
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
  return words
    .map((word, index) => (index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .join("");
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

const scale = (column: ColumnDef) => 10 ** Math.max(0, Math.min(6, Math.trunc(column.config.decimals ?? (column.type === "currency" ? 2 : 0))));

/** Stored integer → display number for number/currency columns. */
export function toDisplayNumber(column: ColumnDef, stored: unknown): number | null {
  if (typeof stored !== "number" || !Number.isFinite(stored)) return null;
  return column.type === "number" || column.type === "currency" ? stored / scale(column) : stored;
}

/** Display number → stored integer. */
export function toStoredNumber(column: ColumnDef, display: number): number {
  if (column.type === "number" || column.type === "currency") return Math.round(display * scale(column));
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

/** Plain text for search, export and sort. */
export function textValue(column: ColumnDef, stored: unknown): string {
  if (stored === null || stored === undefined || stored === "") return "";
  switch (column.type) {
    case "number":
    case "currency": {
      const value = toDisplayNumber(column, stored);
      return value === null ? "" : String(value);
    }
    case "select":
    case "person":
      return optionLabel(column, stored);
    case "multiSelect":
      return Array.isArray(stored) ? stored.map((item) => optionLabel(column, item)).join(", ") : "";
    case "checkbox":
      return stored === true ? "yes" : "no";
    case "trend":
      return Array.isArray(stored) ? stored.join(" ") : "";
    default:
      return String(stored);
  }
}

/** Value used by TanStack sorting. */
export function sortValue(column: ColumnDef, stored: unknown): string | number {
  if (stored === null || stored === undefined || stored === "") return column.type === "date" ? "" : Number.NEGATIVE_INFINITY;
  switch (column.type) {
    case "number":
    case "currency":
    case "percent":
    case "rating":
      return typeof stored === "number" ? stored : Number.NEGATIVE_INFINITY;
    case "checkbox":
      return stored === true ? 1 : 0;
    case "trend":
      return Array.isArray(stored) ? stored.reduce((sum: number, item) => sum + (Number(item) || 0), 0) : 0;
    case "select":
    case "person": {
      // Option order is the meaningful order (e.g. pipeline stages).
      const index = column.config.options?.findIndex((option) => option.value === stored) ?? -1;
      return index >= 0 ? index : textValue(column, stored).toLowerCase();
    }
    default:
      return textValue(column, stored).toLowerCase();
  }
}

export function formatNumber(column: ColumnDef, stored: unknown): string {
  const value = toDisplayNumber(column, stored);
  if (value === null) return "";
  const decimals = column.config.decimals ?? (column.type === "currency" ? 2 : 0);
  if (column.type === "currency") {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: column.config.currency || "EUR",
        minimumFractionDigits: Number.isInteger(value) ? 0 : decimals,
        maximumFractionDigits: decimals,
      }).format(value);
    } catch {
      return value.toLocaleString();
    }
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export function formatDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return String(value ?? "");
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

export function validateValues(columns: ColumnDef[], values: RowValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const column of columns) {
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

/** Primary column: the first visible text-like column, used as the row title. */
export function primaryColumn(columns: ColumnDef[]): ColumnDef | undefined {
  return columns.find((column) => !column.hidden && column.type === "text") ?? columns.find((column) => !column.hidden);
}

export function imageColumn(columns: ColumnDef[]): ColumnDef | undefined {
  return columns.find((column) => column.type === "image");
}

// ---- Filtering -------------------------------------------------------------

export type FilterOp = "contains" | "eq" | "neq" | "gt" | "lt" | "empty" | "notEmpty";
export type RowFilter = { id: string; column: string; op: FilterOp; value: string };

export const FILTER_OPS: Record<FilterOp, string> = {
  contains: "contains",
  eq: "is",
  neq: "is not",
  gt: ">",
  lt: "<",
  empty: "is empty",
  notEmpty: "is not empty",
};

export function opsFor(type: ColumnType): FilterOp[] {
  switch (type) {
    case "number":
    case "currency":
    case "percent":
    case "rating":
    case "date":
      return ["eq", "gt", "lt", "empty", "notEmpty"];
    case "select":
    case "person":
    case "checkbox":
      return ["eq", "neq", "empty", "notEmpty"];
    case "multiSelect":
      return ["contains", "empty", "notEmpty"];
    default:
      return ["contains", "eq", "empty", "notEmpty"];
  }
}

export function matchesFilter(column: ColumnDef, stored: unknown, filter: RowFilter): boolean {
  if (filter.op === "empty") return isEmpty(stored);
  if (filter.op === "notEmpty") return !isEmpty(stored);
  if (filter.value === "") return true;
  switch (column.type) {
    case "number":
    case "currency":
    case "percent":
    case "rating": {
      const value = toDisplayNumber(column, stored);
      const target = Number(filter.value);
      if (value === null || !Number.isFinite(target)) return false;
      return filter.op === "gt" ? value > target : filter.op === "lt" ? value < target : value === target;
    }
    case "date": {
      const value = typeof stored === "string" ? stored.slice(0, 10) : "";
      if (!value) return false;
      return filter.op === "gt" ? value > filter.value : filter.op === "lt" ? value < filter.value : value === filter.value;
    }
    case "checkbox": {
      const target = filter.value === "true";
      return filter.op === "neq" ? (stored === true) !== target : (stored === true) === target;
    }
    case "select":
    case "person":
      return filter.op === "neq" ? stored !== filter.value : stored === filter.value;
    case "multiSelect":
      return Array.isArray(stored) && stored.includes(filter.value);
    default: {
      const text = textValue(column, stored).toLowerCase();
      const target = filter.value.toLowerCase();
      return filter.op === "eq" ? text === target : text.includes(target);
    }
  }
}

// ---- Aggregates ------------------------------------------------------------

export function aggregate(column: ColumnDef, values: unknown[]): string | null {
  const kind = column.config.aggregate;
  if (!kind) return null;
  if (kind === "count") return String(values.filter((value) => !isEmpty(value)).length);
  const numbers = values.filter((value): value is number => typeof value === "number");
  if (numbers.length === 0) return "–";
  const result =
    kind === "sum"
      ? numbers.reduce((sum, value) => sum + value, 0)
      : kind === "avg"
        ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length)
        : kind === "min"
          ? Math.min(...numbers)
          : Math.max(...numbers);
  if (column.type === "percent") return `${result}%`;
  return formatNumber(column, result);
}

export const AGGREGATE_LABELS: Record<Aggregate, string> = {
  sum: "Sum",
  avg: "Average",
  min: "Min",
  max: "Max",
  count: "Count",
};

// ---- Export ----------------------------------------------------------------

export function toCsv(columns: ColumnDef[], rows: RowValues[]): string {
  const escape = (value: string) => (/[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const header = columns.map((column) => escape(column.label)).join(",");
  const lines = rows.map((row) => columns.map((column) => escape(textValue(column, row[column.key]))).join(","));
  return [header, ...lines].join("\n");
}

export function toJsonRows(columns: ColumnDef[], rows: Array<{ id: string; values: RowValues }>): unknown[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = { id: row.id };
    for (const column of columns) {
      const stored = row.values[column.key];
      out[column.key] =
        column.type === "number" || column.type === "currency" ? toDisplayNumber(column, stored) : stored ?? null;
    }
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
