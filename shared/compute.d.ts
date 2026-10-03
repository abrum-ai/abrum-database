export type FormulaAst = unknown;

export declare const COMPUTED_TYPES: string[];
export declare const ROLLUP_FUNCTIONS: string[];

export declare function parseFormula(source: string): FormulaAst;
export declare function formulaReferences(ast: FormulaAst, out?: Set<string>): Set<string>;
export declare function serializeComputed(value: unknown): unknown;

export type ComputeColumn = { key: string; label: string; type: string; config?: Record<string, unknown> | null };
export type ComputeRow = { id: string; values?: Record<string, unknown> | null; createdAtMs?: number; updatedAtMs?: number };
export type ComputeTables = Map<string, { columns: ComputeColumn[]; rows: Map<string, ComputeRow> }>;

export interface Computer {
  display(tableKey: string, row: ComputeRow, column: ComputeColumn): unknown;
  titleOf(tableKey: string, row: ComputeRow): string;
  value(tableKey: string, row: ComputeRow, column: ComputeColumn): { value: unknown; error?: undefined } | { error: string; value?: undefined };
}

export declare function createComputer(tables: ComputeTables): Computer;
