import React from "react";
import type { ColumnDef, RelationTitles } from "./columns";
import type { StoredRow } from "./data";

export type RelatedOption = { id: string; title: string };

type TableContextValue = {
  titles: RelationTitles;
  /** Rows of a related table as {id, title}, for relation pickers. */
  relatedOptions: (tableKey: string | undefined) => RelatedOption[];
  tableName: (tableKey: string | undefined) => string;
  columnsFor: (tableKey: string) => ColumnDef[];
  canWrite: boolean;
};

const TableContext = React.createContext<TableContextValue>({
  titles: () => null,
  relatedOptions: () => [],
  tableName: (key) => key ?? "",
  columnsFor: () => [],
  canWrite: false,
});

export function TableContextProvider({
  titles,
  related,
  tableNames,
  columnsFor,
  canWrite,
  children,
}: {
  titles: RelationTitles;
  related: Map<string, StoredRow[]>;
  tableNames: Map<string, string>;
  columnsFor: (tableKey: string) => ColumnDef[];
  canWrite: boolean;
  children: React.ReactNode;
}) {
  const value = React.useMemo<TableContextValue>(
    () => ({
      titles,
      relatedOptions: (tableKey) =>
        tableKey ? (related.get(tableKey) ?? []).map((row) => ({ id: row.id, title: titles(tableKey, row.id) || "Untitled" })) : [],
      tableName: (tableKey) => (tableKey ? tableNames.get(tableKey) ?? tableKey : ""),
      columnsFor,
      canWrite,
    }),
    [titles, related, tableNames, columnsFor, canWrite],
  );
  return <TableContext.Provider value={value}>{children}</TableContext.Provider>;
}

export const useTableContext = () => React.useContext(TableContext);
