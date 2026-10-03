// Computed properties shared by the UI (src/) and the agent tools (backend/).
// scripts/build-backend.mjs inlines this file into backend/actions.js, so it
// must stay dependency-free plain JavaScript.
//
// Formula language (Notion-compatible subset):
//   prop("Column")            value of another column (by label or key)
//   + - * / % ^               arithmetic (+ also joins text)
//   == != > >= < <=           comparison
//   and or not  && || !       logic
//   cond ? a : b              conditional
//   functions: if, ifs, empty, length, concat, join, contains, lower, upper,
//     trim, replace, slice, format, toNumber, round, floor, ceil, abs, sqrt,
//     pow, min, max, sum, avg, now, today, dateAdd, dateSubtract, dateBetween,
//     formatDate, year, month, day, weekday, at, first, last, unique

export const COMPUTED_TYPES = ["formula", "rollup", "createdTime", "editedTime"];

export const ROLLUP_FUNCTIONS = ["count", "countValues", "countUnique", "sum", "avg", "min", "max", "show", "percentChecked", "earliest", "latest"];

// ---- tokenizer ---------------------------------------------------------------

function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(source[index + 1] ?? ""))) {
      const match = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(source.slice(index));
      tokens.push({ type: "number", value: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    if (char === '"' || char === "'") {
      let value = "";
      let cursor = index + 1;
      while (cursor < source.length && source[cursor] !== char) {
        if (source[cursor] === "\\" && cursor + 1 < source.length) {
          const next = source[cursor + 1];
          value += next === "n" ? "\n" : next === "t" ? "\t" : next;
          cursor += 2;
        } else {
          value += source[cursor];
          cursor += 1;
        }
      }
      if (cursor >= source.length) throw new Error("Unclosed text: missing quote");
      tokens.push({ type: "string", value });
      index = cursor + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index));
      tokens.push({ type: "name", value: match[0] });
      index += match[0].length;
      continue;
    }
    const two = source.slice(index, index + 2);
    if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) {
      tokens.push({ type: "op", value: two });
      index += 2;
      continue;
    }
    if ("+-*/%^()<>!,?:".includes(char)) {
      tokens.push({ type: "op", value: char });
      index += 1;
      continue;
    }
    throw new Error(`Unexpected character “${char}”`);
  }
  tokens.push({ type: "end" });
  return tokens;
}

// ---- parser (precedence climbing) -------------------------------------------

const BINARY = {
  "||": 1, or: 1,
  "&&": 2, and: 2,
  "==": 3, "!=": 3,
  ">": 4, ">=": 4, "<": 4, "<=": 4,
  "+": 5, "-": 5,
  "*": 6, "/": 6, "%": 6,
  "^": 7,
};

export function parseFormula(source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("Formula is empty");
  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const next = () => tokens[position++];
  const expect = (value) => {
    const token = next();
    if (token.type !== "op" || token.value !== value) throw new Error(`Expected “${value}”`);
  };
  const operatorOf = (token) => {
    if (token.type === "op" && BINARY[token.value]) return token.value;
    if (token.type === "name" && (token.value === "and" || token.value === "or")) return token.value;
    return null;
  };

  function primary() {
    const token = next();
    if (token.type === "number") return { kind: "literal", value: token.value };
    if (token.type === "string") return { kind: "literal", value: token.value };
    if (token.type === "op" && token.value === "(") {
      const inner = expression();
      expect(")");
      return inner;
    }
    if (token.type === "op" && (token.value === "-" || token.value === "!")) {
      return { kind: "unary", op: token.value, arg: unaryOperand() };
    }
    if (token.type === "name") {
      if (token.value === "true" || token.value === "false") return { kind: "literal", value: token.value === "true" };
      if (token.value === "not") return { kind: "unary", op: "!", arg: unaryOperand() };
      if (peek().type === "op" && peek().value === "(") {
        next();
        const args = [];
        if (!(peek().type === "op" && peek().value === ")")) {
          do args.push(expression());
          while (peek().type === "op" && peek().value === "," && next());
        }
        expect(")");
        const name = token.value;
        if (name === "prop") {
          if (args.length !== 1 || args[0].kind !== "literal" || typeof args[0].value !== "string") throw new Error('prop() takes one column name in quotes, e.g. prop("Price")');
          return { kind: "prop", name: args[0].value };
        }
        if (!(name in FUNCTIONS)) throw new Error(`Unknown function ${name}()`);
        return { kind: "call", name, args };
      }
      throw new Error(`Unknown name “${token.value}”. Use prop("${token.value}") to read a column.`);
    }
    throw new Error(token.type === "end" ? "Formula ends unexpectedly" : `Unexpected “${token.value}”`);
  }

  function unaryOperand() {
    return binary(primary(), 7);
  }

  function binary(left, minimum) {
    for (;;) {
      const op = operatorOf(peek());
      if (!op || BINARY[op] < minimum) return left;
      next();
      let right = primary();
      for (;;) {
        const nextOp = operatorOf(peek());
        if (!nextOp || BINARY[nextOp] <= BINARY[op]) break;
        right = binary(right, BINARY[nextOp]);
      }
      left = { kind: "binary", op: op === "and" ? "&&" : op === "or" ? "||" : op, left, right };
    }
  }

  function expression() {
    const condition = binary(primary(), 1);
    if (peek().type === "op" && peek().value === "?") {
      next();
      const whenTrue = expression();
      expect(":");
      const whenFalse = expression();
      return { kind: "call", name: "if", args: [condition, whenTrue, whenFalse] };
    }
    return condition;
  }

  const ast = expression();
  if (peek().type !== "end") throw new Error(`Unexpected “${peek().value}”`);
  return ast;
}

/** Column names referenced by prop(), for dependency checks and validation. */
export function formulaReferences(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.kind === "prop") out.add(ast.name);
  if (ast.kind === "unary") formulaReferences(ast.arg, out);
  if (ast.kind === "binary") { formulaReferences(ast.left, out); formulaReferences(ast.right, out); }
  if (ast.kind === "call") for (const arg of ast.args) formulaReferences(arg, out);
  return out;
}

// ---- evaluation --------------------------------------------------------------

const DAY = 86400000;

function isDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function toDate(value) {
  if (isDate(value)) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  return null;
}

function truthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== false && value !== "" && value !== 0;
}

function asText(value) {
  if (value === null || value === undefined) return "";
  if (isDate(value)) return isoDate(value);
  if (Array.isArray(value)) return value.map(asText).join(", ");
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
  return String(value);
}

function asNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (isDate(value)) return value.getTime();
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function equals(left, right) {
  if (isDate(left) || isDate(right)) {
    const a = toDate(left);
    const b = toDate(right);
    return Boolean(a && b) && isoDate(a) === isoDate(b);
  }
  if (Array.isArray(left) || Array.isArray(right)) return asText(left) === asText(right);
  if (typeof left === "number" || typeof right === "number") return asNumber(left) === asNumber(right);
  return asText(left) === asText(right);
}

function compare(left, right) {
  if (isDate(left) || isDate(right)) return (toDate(left)?.getTime() ?? NaN) - (toDate(right)?.getTime() ?? NaN);
  if (typeof left === "string" && typeof right === "string") return left.localeCompare(right);
  return (asNumber(left) ?? NaN) - (asNumber(right) ?? NaN);
}

function unitMs(unit) {
  const map = { milliseconds: 1, seconds: 1000, minutes: 60000, hours: 3600000, days: DAY, weeks: 7 * DAY };
  return map[String(unit).toLowerCase()] ?? null;
}

function addToDate(date, amount, unit) {
  const result = new Date(date.getTime());
  const name = String(unit).toLowerCase();
  if (name === "months") result.setUTCMonth(result.getUTCMonth() + amount);
  else if (name === "quarters") result.setUTCMonth(result.getUTCMonth() + amount * 3);
  else if (name === "years") result.setUTCFullYear(result.getUTCFullYear() + amount);
  else {
    const ms = unitMs(name);
    if (!ms) throw new Error(`Unknown date unit “${unit}”`);
    result.setTime(result.getTime() + amount * ms);
  }
  return result;
}

const flat = (args) => args.flatMap((arg) => (Array.isArray(arg) ? arg : [arg]));
const numbers = (args) => flat(args).map(asNumber).filter((value) => value !== null);

const FUNCTIONS = {
  if: null, // lazy, handled in evaluate
  ifs: null,
  empty: (value) => !truthy(value) && value !== 0 && value !== false,
  length: (value) => (Array.isArray(value) ? value.length : asText(value).length),
  concat: (...args) => (args.some(Array.isArray) ? flat(args) : args.map(asText).join("")),
  join: (list, separator = ", ") => (Array.isArray(list) ? list : [list]).map(asText).join(asText(separator)),
  contains: (haystack, needle) => (Array.isArray(haystack) ? haystack.some((item) => equals(item, needle)) : asText(haystack).toLowerCase().includes(asText(needle).toLowerCase())),
  lower: (value) => asText(value).toLowerCase(),
  upper: (value) => asText(value).toUpperCase(),
  trim: (value) => asText(value).trim(),
  replace: (value, search, replacement = "") => asText(value).split(asText(search)).join(asText(replacement)),
  slice: (value, start, end) => (Array.isArray(value) ? value.slice(start, end) : asText(value).slice(asNumber(start) ?? 0, end === undefined ? undefined : asNumber(end) ?? undefined)),
  format: (value) => asText(value),
  toNumber: (value) => asNumber(value),
  round: (value, digits = 0) => {
    const number = asNumber(value);
    if (number === null) return null;
    const factor = 10 ** (asNumber(digits) ?? 0);
    return Math.round(number * factor) / factor;
  },
  floor: (value) => (asNumber(value) === null ? null : Math.floor(asNumber(value))),
  ceil: (value) => (asNumber(value) === null ? null : Math.ceil(asNumber(value))),
  abs: (value) => (asNumber(value) === null ? null : Math.abs(asNumber(value))),
  sqrt: (value) => (asNumber(value) === null ? null : Math.sqrt(asNumber(value))),
  pow: (base, exponent) => (asNumber(base) ?? 0) ** (asNumber(exponent) ?? 1),
  min: (...args) => (numbers(args).length ? Math.min(...numbers(args)) : null),
  max: (...args) => (numbers(args).length ? Math.max(...numbers(args)) : null),
  sum: (...args) => numbers(args).reduce((total, value) => total + value, 0),
  avg: (...args) => (numbers(args).length ? numbers(args).reduce((total, value) => total + value, 0) / numbers(args).length : null),
  now: () => new Date(),
  today: () => new Date(`${isoDate(new Date())}T00:00:00Z`),
  dateAdd: (date, amount, unit = "days") => (toDate(date) ? addToDate(toDate(date), asNumber(amount) ?? 0, unit) : null),
  dateSubtract: (date, amount, unit = "days") => (toDate(date) ? addToDate(toDate(date), -(asNumber(amount) ?? 0), unit) : null),
  dateBetween: (end, start, unit = "days") => {
    const a = toDate(end);
    const b = toDate(start);
    if (!a || !b) return null;
    const name = String(unit).toLowerCase();
    if (name === "months" || name === "years") {
      const months = (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + (a.getUTCMonth() - b.getUTCMonth()) - (a.getUTCDate() < b.getUTCDate() ? 1 : 0);
      return name === "years" ? Math.trunc(months / 12) : months;
    }
    const ms = unitMs(name);
    if (!ms) throw new Error(`Unknown date unit “${unit}”`);
    return Math.trunc((a.getTime() - b.getTime()) / ms);
  },
  formatDate: (date, pattern = "YYYY-MM-DD") => {
    const value = toDate(date);
    if (!value) return "";
    const pad = (number) => String(number).padStart(2, "0");
    return asText(pattern)
      .replace(/YYYY/g, String(value.getUTCFullYear()))
      .replace(/MM/g, pad(value.getUTCMonth() + 1))
      .replace(/DD/g, pad(value.getUTCDate()))
      .replace(/HH/g, pad(value.getUTCHours()))
      .replace(/mm/g, pad(value.getUTCMinutes()));
  },
  year: (date) => toDate(date)?.getUTCFullYear() ?? null,
  month: (date) => (toDate(date) ? toDate(date).getUTCMonth() + 1 : null),
  day: (date) => toDate(date)?.getUTCDate() ?? null,
  weekday: (date) => (toDate(date) ? toDate(date).getUTCDay() || 7 : null),
  at: (list, index) => (Array.isArray(list) ? list[asNumber(index) ?? 0] ?? null : null),
  first: (list) => (Array.isArray(list) ? list[0] ?? null : list),
  last: (list) => (Array.isArray(list) ? list[list.length - 1] ?? null : list),
  unique: (list) => (Array.isArray(list) ? [...new Map(list.map((item) => [asText(item), item])).values()] : list),
};

function evaluate(ast, resolve) {
  switch (ast.kind) {
    case "literal":
      return ast.value;
    case "prop":
      return resolve(ast.name);
    case "unary": {
      const value = evaluate(ast.arg, resolve);
      if (ast.op === "!") return !truthy(value);
      const number = asNumber(value);
      return number === null ? null : -number;
    }
    case "binary": {
      if (ast.op === "&&") return truthy(evaluate(ast.left, resolve)) && truthy(evaluate(ast.right, resolve));
      if (ast.op === "||") return truthy(evaluate(ast.left, resolve)) || truthy(evaluate(ast.right, resolve));
      const left = evaluate(ast.left, resolve);
      const right = evaluate(ast.right, resolve);
      switch (ast.op) {
        case "+":
          if (isDate(left) && typeof right === "number") return new Date(left.getTime() + right * DAY);
          if (typeof left === "string" || typeof right === "string" || Array.isArray(left) || Array.isArray(right)) return asText(left) + asText(right);
          return (asNumber(left) ?? 0) + (asNumber(right) ?? 0);
        case "-":
          if (isDate(left) && typeof right === "number") return new Date(left.getTime() - right * DAY);
          return (asNumber(left) ?? 0) - (asNumber(right) ?? 0);
        case "*": return (asNumber(left) ?? 0) * (asNumber(right) ?? 0);
        case "/": {
          const divisor = asNumber(right);
          return divisor ? (asNumber(left) ?? 0) / divisor : null;
        }
        case "%": {
          const divisor = asNumber(right);
          return divisor ? (asNumber(left) ?? 0) % divisor : null;
        }
        case "^": return (asNumber(left) ?? 0) ** (asNumber(right) ?? 1);
        case "==": return equals(left, right);
        case "!=": return !equals(left, right);
        case ">": return compare(left, right) > 0;
        case ">=": return compare(left, right) >= 0;
        case "<": return compare(left, right) < 0;
        case "<=": return compare(left, right) <= 0;
        default: throw new Error(`Unknown operator ${ast.op}`);
      }
    }
    case "call": {
      if (ast.name === "if") {
        if (ast.args.length < 2) throw new Error("if() needs a condition and a value");
        return truthy(evaluate(ast.args[0], resolve)) ? evaluate(ast.args[1], resolve) : ast.args[2] ? evaluate(ast.args[2], resolve) : null;
      }
      if (ast.name === "ifs") {
        for (let index = 0; index + 1 < ast.args.length; index += 2) {
          if (truthy(evaluate(ast.args[index], resolve))) return evaluate(ast.args[index + 1], resolve);
        }
        return ast.args.length % 2 ? evaluate(ast.args[ast.args.length - 1], resolve) : null;
      }
      return FUNCTIONS[ast.name](...ast.args.map((arg) => evaluate(arg, resolve)));
    }
    default:
      throw new Error("Invalid formula");
  }
}

// ---- display values --------------------------------------------------------

function scaleOf(column) {
  const config = column.config || {};
  const decimals = Number.isInteger(config.decimals) ? config.decimals : column.type === "currency" ? 2 : 0;
  return 10 ** Math.max(0, Math.min(6, decimals));
}

function optionName(column, value) {
  const option = (column.config?.options || []).find((item) => item.value === value);
  return option ? option.label || option.value : value;
}

/** Normalize a JS result to a JSON-safe value (dates become YYYY-MM-DD). */
export function serializeComputed(value) {
  if (isDate(value)) return isoDate(value);
  if (Array.isArray(value)) return value.map(serializeComputed);
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value === undefined ? null : value;
}

/**
 * Evaluates computed columns across tables.
 * tables: Map<tableKey, { columns: Column[], rows: Map<rowId, Row> }>
 * Column: { key, label, type, config }. Row: { id, values, createdAtMs, updatedAtMs }.
 */
export function createComputer(tables) {
  const memo = new Map();
  const formulas = new Map();
  const visiting = new Set();

  function table(tableKey) {
    return tables.get(tableKey) || { columns: [], rows: new Map() };
  }

  function findColumn(tableKey, name) {
    const columns = table(tableKey).columns;
    return columns.find((column) => column.key === name)
      || columns.find((column) => column.label === name)
      || columns.find((column) => column.label.toLowerCase() === String(name).toLowerCase());
  }

  function compiled(column) {
    const source = column.config?.expression || "";
    if (!formulas.has(source)) {
      try {
        formulas.set(source, { ast: parseFormula(source) });
      } catch (error) {
        formulas.set(source, { error: error.message });
      }
    }
    return formulas.get(source);
  }

  function titleOf(tableKey, row) {
    const primary = table(tableKey).columns.find((column) => column.type === "text") || table(tableKey).columns[0];
    return primary ? asText(display(tableKey, row, primary)) : row.id;
  }

  /** Value as formulas and rollups see it (display units, labels, Dates). */
  function display(tableKey, row, column) {
    if (!row) return null;
    const stored = row.values ? row.values[column.key] : undefined;
    switch (column.type) {
      case "number":
      case "currency":
        return typeof stored === "number" ? stored / scaleOf(column) : null;
      case "percent":
      case "rating":
        return typeof stored === "number" ? stored : null;
      case "checkbox":
        return stored === true;
      case "date":
        return toDate(stored);
      case "select":
      case "person":
        return stored === undefined || stored === null ? null : optionName(column, stored);
      case "multiSelect":
        return Array.isArray(stored) ? stored.map((item) => optionName(column, item)) : [];
      case "relation": {
        const target = column.config?.tableKey;
        return Array.isArray(stored) ? stored.map((id) => table(target).rows.get(id)).filter(Boolean).map((related) => titleOf(target, related)) : [];
      }
      case "trend":
        return Array.isArray(stored) ? stored : [];
      case "createdTime":
      case "editedTime":
      case "formula":
      case "rollup":
        return computed(tableKey, row, column);
      default:
        return stored === undefined ? null : stored;
    }
  }

  function computed(tableKey, row, column) {
    const cacheKey = `${tableKey}\u0000${row.id}\u0000${column.key}`;
    if (memo.has(cacheKey)) return memo.get(cacheKey);
    if (visiting.has(cacheKey)) throw new Error(`Circular reference through “${column.label}”`);
    visiting.add(cacheKey);
    let value = null;
    try {
      if (column.type === "createdTime") value = new Date(Number(row.createdAtMs) || 0);
      else if (column.type === "editedTime") value = new Date(Number(row.updatedAtMs || row.createdAtMs) || 0);
      else if (column.type === "formula") {
        const formula = compiled(column);
        if (formula.error) throw new Error(formula.error);
        value = evaluate(formula.ast, (name) => {
          const referenced = findColumn(tableKey, name);
          if (!referenced) throw new Error(`Unknown column “${name}”`);
          return display(tableKey, row, referenced);
        });
      } else if (column.type === "rollup") value = rollup(tableKey, row, column);
    } finally {
      visiting.delete(cacheKey);
    }
    memo.set(cacheKey, value);
    return value;
  }

  function rollup(tableKey, row, column) {
    const config = column.config || {};
    const relation = findColumn(tableKey, config.relation || "");
    if (!relation || relation.type !== "relation") throw new Error("Rollup needs a relation column");
    const target = relation.config?.tableKey;
    const ids = Array.isArray(row.values?.[relation.key]) ? row.values[relation.key] : [];
    const related = ids.map((id) => table(target).rows.get(id)).filter(Boolean);
    const fn = config.fn || "count";
    if (fn === "count") return related.length;
    const property = findColumn(target, config.property || "");
    if (!property) throw new Error("Rollup needs a property of the related table");
    const values = related.map((item) => display(target, item, property));
    const present = values.flatMap((value) => (Array.isArray(value) ? value : [value])).filter((value) => value !== null && value !== undefined && value !== "");
    switch (fn) {
      case "countValues": return present.length;
      case "countUnique": return new Set(present.map(asText)).size;
      case "sum": return numbers(present).reduce((total, value) => total + value, 0);
      case "avg": return numbers(present).length ? numbers(present).reduce((total, value) => total + value, 0) / numbers(present).length : null;
      case "min": return numbers(present).length ? Math.min(...numbers(present)) : null;
      case "max": return numbers(present).length ? Math.max(...numbers(present)) : null;
      case "percentChecked": return values.length ? Math.round((values.filter((value) => value === true).length / values.length) * 100) : null;
      case "earliest": {
        const dates = present.map(toDate).filter(Boolean).sort((a, b) => a - b);
        return dates[0] || null;
      }
      case "latest": {
        const dates = present.map(toDate).filter(Boolean).sort((a, b) => b - a);
        return dates[0] || null;
      }
      case "show": return present;
      default: throw new Error(`Unknown rollup function ${fn}`);
    }
  }

  return {
    display,
    titleOf,
    /** JSON-safe value of a computed column, or { error } when it fails. */
    value(tableKey, row, column) {
      try {
        return { value: serializeComputed(computed(tableKey, row, column)) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
