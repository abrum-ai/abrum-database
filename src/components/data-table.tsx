import React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef as TanColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Columns3,
  EyeOff,
  FileDown,
  Filter,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  AGGREGATE_LABELS,
  FILTER_OPS,
  aggregate,
  download,
  matchesFilter,
  opsFor,
  slugKey,
  sortValue,
  imageColumn,
  primaryColumn,
  textValue,
  toCsv,
  toJsonRows,
  type ColumnDef,
  type FilterOp,
  type RowFilter,
} from "@/lib/columns";
import type { TableRow as Row } from "@/lib/data";
import { CellView, ImageThumb, Monogram } from "./cells";

type Props = {
  tableName: string;
  itemName: string;
  columns: ColumnDef[];
  rows: Row[];
  canWrite: boolean;
  onOpenRow: (id: string) => void;
  onNewItem: () => void;
  onAddColumn: () => void;
  onEditColumn: (column: ColumnDef) => void;
  onHideColumn: (column: ColumnDef, hidden: boolean) => void;
  onDeleteColumn: (column: ColumnDef) => void;
  onDeleteRows: (ids: string[]) => Promise<unknown>;
};

const NONE = "__none__";

export function DataTable(props: Props) {
  const { columns, rows, canWrite } = props;
  const visible = React.useMemo(() => columns.filter((column) => !column.hidden), [columns]);
  // The first image column is shown as a thumbnail inside the primary column.
  const primary = primaryColumn(visible.filter((column) => column.type !== "image"));
  const thumb = imageColumn(visible);
  const tableColumns = React.useMemo(() => visible.filter((column) => !(thumb && column.key === thumb.key && primary)), [visible, thumb, primary]);
  const [search, setSearch] = React.useState("");
  const [filters, setFilters] = React.useState<RowFilter[]>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [selection, setSelection] = React.useState<RowSelectionState>({});

  // Reset view state when another table is shown.
  React.useEffect(() => {
    setSearch("");
    setFilters([]);
    setSorting([]);
    setSelection({});
  }, [props.tableName]);

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    const byKey = new Map(columns.map((column) => [column.key, column]));
    return rows.filter((row) => {
      if (needle && !columns.some((column) => textValue(column, row.values[column.key]).toLowerCase().includes(needle))) return false;
      return filters.every((filter) => {
        const column = byKey.get(filter.column);
        return !column || matchesFilter(column, row.values[column.key], filter);
      });
    });
  }, [rows, columns, search, filters]);

  const tanColumns = React.useMemo<TanColumnDef<Row>[]>(
    () => [
      {
        id: "__select",
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all"
            checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(checked) => table.toggleAllRowsSelected(checked === true)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox aria-label="Select row" checked={row.getIsSelected()} onClick={(event) => event.stopPropagation()} onCheckedChange={(checked) => row.toggleSelected(checked === true)} />
        ),
        size: 44,
      },
      ...tableColumns.map<TanColumnDef<Row>>((column) => ({
        id: column.key,
        accessorFn: (row) => sortValue(column, row.values[column.key]),
        header: column.label,
        cell: ({ row }) =>
          thumb && column.key === primary?.key ? (
            <span className="flex items-center gap-3">
              <ImageThumb
                value={row.original.values[thumb.key]}
                size={28}
                className="rounded-md text-[28px]"
                fallback={<Monogram text={textValue(column, row.original.values[column.key])} />}
              />
              <CellView column={column} value={row.original.values[column.key]} />
            </span>
          ) : (
            <CellView column={column} value={row.original.values[column.key]} />
          ),
        sortUndefined: "last",
        size: column.config.width,
        meta: column,
      })),
    ],
    [tableColumns, thumb, primary],
  );

  const table = useReactTable({
    data: filtered,
    columns: tanColumns,
    state: { sorting, rowSelection: selection },
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
  });

  const sortedRows = table.getRowModel().rows;
  const selectedIds = Object.keys(selection).filter((id) => selection[id] && rows.some((row) => row.id === id));
  const exportRows = selectedIds.length ? sortedRows.filter((row) => selection[row.id]) : sortedRows;
  const fileBase = slugKey(props.tableName) || "table";
  const footer = visible.filter((column) => column.config.aggregate);
  const sortColumn = sorting[0]?.id ?? NONE;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${props.tableName.toLowerCase()}…`} className="pl-8" aria-label="Search rows" />
        </div>

        <Pill label="Sort by">
          <Select
            value={sortColumn}
            onValueChange={(value) => setSorting(value === NONE ? [] : [{ id: value, desc: sorting[0]?.id === value ? sorting[0].desc : true }])}
          >
            <SelectTrigger size="sm" className="h-8 rounded-l-none border-0 border-l shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Created</SelectItem>
              {visible.map((column) => (
                <SelectItem key={column.key} value={column.key}>
                  {column.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sorting[0] ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-8 rounded-l-none border-l"
              aria-label={sorting[0].desc ? "Sort ascending" : "Sort descending"}
              onClick={() => setSorting([{ id: sorting[0].id, desc: !sorting[0].desc }])}
            >
              {sorting[0].desc ? <ArrowDown /> : <ArrowUp />}
            </Button>
          ) : null}
        </Pill>

        <FilterMenu columns={visible.filter((column) => column.type !== "image" && column.type !== "trend")} filters={filters} onChange={setFilters} />

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              {columns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  checked={!column.hidden}
                  disabled={!canWrite}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) => props.onHideColumn(column, !checked)}
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
              {canWrite ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={props.onAddColumn}>
                    <Plus /> Add column
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <FileDown /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{selectedIds.length ? `${selectedIds.length} selected` : `${sortedRows.length} in view`}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => download(`${fileBase}.csv`, toCsv(columns, exportRows.map((row) => row.original.values)), "text/csv;charset=utf-8")}>CSV</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  download(`${fileBase}.json`, JSON.stringify(toJsonRows(columns, exportRows.map((row) => row.original)), null, 2), "application/json")
                }
              >
                JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {canWrite ? (
            <Button size="sm" onClick={props.onNewItem} disabled={visible.length === 0}>
              <Plus /> New {props.itemName}
            </Button>
          ) : null}
        </div>
      </div>

      {selectedIds.length > 0 ? (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-lg border bg-muted/60 px-3 py-1.5 text-sm sm:mx-6">
          <span>{selectedIds.length} selected</span>
          {canWrite ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={async () => {
                await props.onDeleteRows(selectedIds);
                setSelection({});
              }}
            >
              <Trash2 /> Delete
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelection({})}>
            Clear
          </Button>
        </div>
      ) : null}

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto border-t">
        <Table className="min-w-max">
          <TableHeader className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const column = header.column.columnDef.meta as ColumnDef | undefined;
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      style={header.column.columnDef.size ? { width: header.column.columnDef.size } : undefined}
                      className={cn("h-11 font-normal text-muted-foreground", header.id === "__select" ? "pl-4 sm:pl-6" : "", column && isNumeric(column) && "text-right")}
                    >
                      {column ? (
                        <ColumnHeader
                          column={column}
                          sorted={sorted}
                          canWrite={canWrite}
                          onSort={(desc) => setSorting([{ id: column.key, desc }])}
                          onEdit={() => props.onEditColumn(column)}
                          onHide={() => props.onHideColumn(column, true)}
                          onDelete={() => props.onDeleteColumn(column)}
                        />
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
                {canWrite ? (
                  <TableHead className="w-12 pr-4 text-right sm:pr-6">
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Add column" onClick={props.onAddColumn}>
                      <Plus />
                    </Button>
                  </TableHead>
                ) : null}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={tableColumns.length + 2} className="h-40 text-center text-muted-foreground">
                  {rows.length === 0 ? `No ${props.itemName.toLowerCase()} yet.` : "No rows match the search or filters."}
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className="h-14 cursor-pointer"
                  onClick={() => props.onOpenRow(row.id)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const column = cell.column.columnDef.meta as ColumnDef | undefined;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(cell.column.id === "__select" && "pl-4 sm:pl-6", column?.key === primary?.key && "font-medium", "max-w-80")}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                  {canWrite ? (
                    <TableCell className="pr-4 text-right sm:pr-6">
                      <MoreHorizontal className="ml-auto size-4 text-muted-foreground" />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-1 border-t px-4 py-2.5 text-sm text-muted-foreground sm:px-6">
        <span>
          <span className="text-foreground tabular-nums">{sortedRows.length}</span>
          {sortedRows.length !== rows.length ? ` of ${rows.length}` : ""} {props.tableName.toLowerCase()} in view
        </span>
        {footer.map((column) => (
          <span key={column.key}>
            {AGGREGATE_LABELS[column.config.aggregate!]} of {column.label.toLowerCase()}:{" "}
            <span className="text-foreground tabular-nums">{aggregate(column, sortedRows.map((row) => row.original.values[column.key]))}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function isNumeric(column: ColumnDef) {
  return column.type === "number" || column.type === "currency";
}

function Pill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center overflow-hidden rounded-md border text-sm shadow-xs">
      <span className="px-2.5 text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ColumnHeader({
  column,
  sorted,
  canWrite,
  onSort,
  onEdit,
  onHide,
  onDelete,
}: {
  column: ColumnDef;
  sorted: false | "asc" | "desc";
  canWrite: boolean;
  onSort: (desc: boolean) => void;
  onEdit: () => void;
  onHide: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn("-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent hover:text-foreground", sorted && "text-foreground", isNumeric(column) && "flex-row-reverse")}>
          {column.label}
          {sorted === "asc" ? <ArrowUp className="size-3.5" /> : sorted === "desc" ? <ArrowDown className="size-3.5" /> : <ChevronDown className="size-3.5 opacity-40" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => onSort(false)}>
          <ArrowUp /> Sort ascending
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSort(true)}>
          <ArrowDown /> Sort descending
        </DropdownMenuItem>
        {canWrite ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit column
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onHide}>
              <EyeOff /> Hide
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 /> Delete column
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterMenu({ columns, filters, onChange }: { columns: ColumnDef[]; filters: RowFilter[]; onChange: (filters: RowFilter[]) => void }) {
  const update = (id: string, patch: Partial<RowFilter>) => onChange(filters.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter)));
  const add = () => {
    const column = columns[0];
    if (!column) return;
    onChange([...filters, { id: crypto.randomUUID(), column: column.key, op: opsFor(column.type)[0], value: "" }]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn(filters.length && "border-foreground/30")}>
          <Filter /> Filter{filters.length ? ` · ${filters.length}` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] p-3">
        <div className="grid gap-2">
          {filters.length === 0 ? <p className="text-sm text-muted-foreground">No filters. Add one to narrow the rows.</p> : null}
          {filters.map((filter) => {
            const column = columns.find((item) => item.key === filter.column) ?? columns[0];
            if (!column) return null;
            return (
              <div key={filter.id} className="flex flex-wrap items-center gap-2">
                <Select
                  value={column.key}
                  onValueChange={(key) => {
                    const next = columns.find((item) => item.key === key)!;
                    update(filter.id, { column: key, op: opsFor(next.type)[0], value: "" });
                  }}
                >
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filter.op} onValueChange={(op) => update(filter.id, { op: op as FilterOp })}>
                  <SelectTrigger size="sm" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {opsFor(column.type).map((op) => (
                      <SelectItem key={op} value={op}>
                        {FILTER_OPS[op]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filter.op === "empty" || filter.op === "notEmpty" ? null : <FilterValue column={column} value={filter.value} onChange={(value) => update(filter.id, { value })} />}
                <Button size="icon" variant="ghost" className="size-8" aria-label="Remove filter" onClick={() => onChange(filters.filter((item) => item.id !== filter.id))}>
                  <X />
                </Button>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-1">
            <Button size="sm" variant="ghost" onClick={add}>
              <Plus /> Add filter
            </Button>
            {filters.length ? (
              <Button size="sm" variant="ghost" onClick={() => onChange([])}>
                Clear all
              </Button>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterValue({ column, value, onChange }: { column: ColumnDef; value: string; onChange: (value: string) => void }) {
  if (column.type === "select" || column.type === "multiSelect" || column.type === "person") {
    return (
      <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? "" : next)}>
        <SelectTrigger size="sm" className="w-40">
          <SelectValue placeholder="Any" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Any</SelectItem>
          {(column.config.options ?? []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label ?? option.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (column.type === "checkbox") {
    return (
      <Select value={value || "true"} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">checked</SelectItem>
          <SelectItem value="false">unchecked</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  const type = column.type === "date" ? "date" : ["number", "currency", "percent", "rating"].includes(column.type) ? "number" : "text";
  return <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-40" placeholder="Value" />;
}

