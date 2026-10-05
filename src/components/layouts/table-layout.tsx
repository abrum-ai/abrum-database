import React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef as TanColumnDef,
  type ColumnSizingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronDown, Copy, EyeOff, Maximize2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  AGGREGATE_LABELS,
  TYPE_LABELS,
  aggregate,
  aggregatesFor,
  imageColumn,
  isComputed,
  primaryColumn,
  textValue,
  type Aggregate,
  type ColumnDef,
  type RowValues,
} from "@/lib/columns";
import type { RowView } from "@/lib/data";
import { useTableContext } from "@/lib/table-context";
import type { ViewSort } from "@/lib/views";
import { CellView, ImageThumb, Monogram } from "../cells";
import { FieldInput } from "../field-input";

type ViewColumnDef = ColumnDef & { width?: number };

export type TableLayoutProps = {
  itemName: string;
  columns: ViewColumnDef[];
  rows: RowView[];
  totalRows: number;
  sorts: ViewSort[];
  selection: RowSelectionState;
  onSelectionChange: (selection: RowSelectionState) => void;
  onSort: (sorts: ViewSort[]) => void;
  onOpenRow: (id: string) => void;
  onUpdateCell: (id: string, key: string, value: unknown) => Promise<unknown>;
  onQuickAdd: (title: string) => Promise<unknown>;
  onDuplicateRow: (id: string) => Promise<unknown>;
  onDeleteRows: (ids: string[]) => Promise<unknown>;
  onAddColumn: () => void;
  onEditColumn: (column: ColumnDef) => void;
  onHideColumn: (column: ColumnDef) => void;
  onDeleteColumn: (column: ColumnDef) => void;
  onResizeColumns: (widths: Record<string, number>) => void;
  onMoveColumn: (key: string, beforeKey: string | null) => void;
  onSetAggregate: (column: ColumnDef, aggregate: Aggregate | undefined) => void;
};

const ROW_HEIGHT = 48;
const DEFAULT_WIDTH: Partial<Record<ColumnDef["type"], number>> = {
  text: 220,
  longText: 260,
  percent: 200,
  multiSelect: 220,
  relation: 220,
  checkbox: 90,
  rating: 130,
  image: 90,
  trend: 140,
  date: 150,
};

export function TableLayout(props: TableLayoutProps) {
  const { columns, rows } = props;
  const { canWrite } = useTableContext();
  const primary = primaryColumn(columns.filter((column) => column.type !== "image"));
  const thumb = imageColumn(columns);
  const tableColumns = React.useMemo(() => columns.filter((column) => !(thumb && primary && column.key === thumb.key)), [columns, thumb, primary]);
  const [sizing, setSizing] = React.useState<ColumnSizingState>({});
  const [dragKey, setDragKey] = React.useState<string | null>(null);

  const tanColumns = React.useMemo<TanColumnDef<RowView>[]>(
    () => [
      {
        id: "__select",
        size: 44,
        enableResizing: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all"
            checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(checked) => table.toggleAllRowsSelected(checked === true)}
          />
        ),
        cell: ({ row }) => <Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(checked) => row.toggleSelected(checked === true)} />,
      },
      ...tableColumns.map<TanColumnDef<RowView>>((column) => ({
        id: column.key,
        size: column.width ?? DEFAULT_WIDTH[column.type] ?? 170,
        minSize: 70,
        maxSize: 800,
        header: column.label,
        meta: column,
        cell: ({ row }) => (
          <EditableCell
            column={column}
            row={row.original}
            primary={column.key === primary?.key}
            thumb={column.key === primary?.key ? thumb : undefined}
            onOpen={() => props.onOpenRow(row.original.id)}
            onCommit={(value) => props.onUpdateCell(row.original.id, column.key, value)}
          />
        ),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableColumns, primary, thumb, props.onOpenRow, props.onUpdateCell],
  );

  const table = useReactTable({
    data: rows,
    columns: tanColumns,
    state: { rowSelection: props.selection, columnSizing: sizing },
    getRowId: (row) => row.id,
    onRowSelectionChange: (updater) => props.onSelectionChange(typeof updater === "function" ? updater(props.selection) : updater),
    onColumnSizingChange: setSizing,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
    enableColumnResizing: canWrite,
  });

  // Persist widths once a resize ends.
  const resizing = table.getState().columnSizingInfo.isResizingColumn;
  const wasResizing = React.useRef<string | false>(false);
  React.useEffect(() => {
    if (wasResizing.current && !resizing && Object.keys(sizing).length) {
      props.onResizeColumns(Object.fromEntries(Object.entries(sizing).map(([key, width]) => [key, Math.round(width)])));
      setSizing({});
    }
    wasResizing.current = resizing;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  const scroller = React.useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({ count: tableRows.length, getScrollElement: () => scroller.current, estimateSize: () => ROW_HEIGHT, overscan: 12 });
  const items = virtualizer.getVirtualItems();
  const paddingTop = items.length ? items[0].start : 0;
  const paddingBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
  const totalWidth = table.getTotalSize() + (canWrite ? 48 : 0);
  const sortOf = (key: string) => props.sorts.find((sort) => sort.column === key)?.direction;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto border-t">
        <table className="table-fixed border-separate border-spacing-0 text-sm" style={{ width: totalWidth }}>
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <col key={column.id} style={{ width: column.getSize() }} />
            ))}
            {canWrite ? <col style={{ width: 48 }} /> : null}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const column = header.column.columnDef.meta as ColumnDef | undefined;
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "relative h-11 border-b px-3 text-left font-normal whitespace-nowrap text-muted-foreground",
                        header.id === "__select" && "pl-4 sm:pl-6",
                        dragKey && column && dragKey !== column.key && "data-[over=true]:border-l-2 data-[over=true]:border-l-foreground",
                      )}
                      draggable={Boolean(column) && canWrite}
                      onDragStart={(event) => {
                        if (!column) return;
                        setDragKey(column.key);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", column.key);
                      }}
                      onDragOver={(event) => {
                        if (!column || !dragKey) return;
                        event.preventDefault();
                        event.currentTarget.dataset.over = "true";
                      }}
                      onDragLeave={(event) => delete event.currentTarget.dataset.over}
                      onDrop={(event) => {
                        delete event.currentTarget.dataset.over;
                        if (column && dragKey && dragKey !== column.key) props.onMoveColumn(dragKey, column.key);
                        setDragKey(null);
                      }}
                      onDragEnd={() => setDragKey(null)}
                    >
                      {column ? (
                        <ColumnHeader
                          column={column}
                          sorted={sortOf(column.key)}
                          canWrite={canWrite}
                          onSort={(direction) => props.onSort([{ column: column.key, direction }])}
                          onEdit={() => props.onEditColumn(column)}
                          onHide={() => props.onHideColumn(column)}
                          onDelete={() => props.onDeleteColumn(column)}
                        />
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                      {header.column.getCanResize() ? (
                        <span
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${column?.label ?? "column"}`}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={() => header.column.resetSize()}
                          className={cn(
                            "absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-foreground/20",
                            header.column.getIsResizing() && "bg-foreground/30",
                          )}
                        />
                      ) : null}
                    </th>
                  );
                })}
                {canWrite ? (
                  <th className="sticky right-0 h-11 border-b bg-background pr-4 text-right sm:pr-6">
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Add property" onClick={props.onAddColumn}>
                      <Plus />
                    </Button>
                  </th>
                ) : null}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 ? (
              <tr aria-hidden="true">
                <td style={{ height: paddingTop }} colSpan={tanColumns.length + 1} />
              </tr>
            ) : null}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={tanColumns.length + 1} className="h-32 text-center text-muted-foreground">
                  {props.totalRows === 0 ? `No ${props.itemName.toLowerCase()} yet.` : "No rows match the search or filters."}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const row = tableRows[item.index];
                return (
                  <tr key={row.id} data-state={row.getIsSelected() ? "selected" : undefined} className="group h-12 hover:bg-muted/40 data-[state=selected]:bg-muted/70">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cn("h-12 max-w-0 border-b px-3", cell.column.id === "__select" && "pl-4 sm:pl-6")}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                    {canWrite ? (
                      <td className="sticky right-0 h-12 border-b bg-background pr-4 text-right group-hover:bg-muted/40 sm:pr-6">
                        <RowMenu
                          onOpen={() => props.onOpenRow(row.original.id)}
                          onDuplicate={() => props.onDuplicateRow(row.original.id)}
                          onDelete={() => props.onDeleteRows([row.original.id])}
                        />
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
            {paddingBottom > 0 ? (
              <tr aria-hidden="true">
                <td style={{ height: paddingBottom }} colSpan={tanColumns.length + 1} />
              </tr>
            ) : null}
            {canWrite && primary ? (
              <tr>
                <td className="border-b pl-4 sm:pl-6" />
                <td colSpan={tanColumns.length} className="border-b px-3">
                  <QuickAdd itemName={props.itemName} onAdd={props.onQuickAdd} />
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot className="sticky bottom-0 z-10 bg-background">
            <tr>
              <td className="h-10 border-t pl-4 text-xs text-muted-foreground sm:pl-6" />
              {tableColumns.map((column) => (
                <td key={column.key} className="h-10 border-t px-1">
                  <FooterCell column={column} rows={rows} canWrite={canWrite} onSet={(kind) => props.onSetAggregate(column, kind)} />
                </td>
              ))}
              {canWrite ? <td className="sticky right-0 h-10 border-t bg-background" /> : null}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** A cell that edits in place (popover editor) for stored types. */
function EditableCell({
  column,
  row,
  primary,
  thumb,
  onOpen,
  onCommit,
}: {
  column: ColumnDef;
  row: RowView;
  primary: boolean;
  thumb?: ColumnDef;
  onOpen: () => void;
  onCommit: (value: unknown) => Promise<unknown>;
}) {
  const { canWrite, titles } = useTableContext();
  const value = row.values[column.key];
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<unknown>(value);
  const [error, setError] = React.useState<string | null>(null);
  const editable = canWrite && !isComputed(column) && column.type !== "image";

  const display = (
    <span className={cn("flex min-w-0 items-center gap-2", primary && "font-medium")}>
      {thumb ? (
        <ImageThumb value={row.values[thumb.key]} size={28} className="shrink-0 rounded-md text-display" fallback={<Monogram text={textValue(column, value, titles)} />} />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{primary && !value ? <span className="text-muted-foreground/60">Untitled</span> : <CellView column={column} value={value} />}</span>
    </span>
  );

  const openButton = primary ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-6 shrink-0 px-1.5 text-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <Maximize2 className="size-3" /> Open
    </Button>
  ) : null;

  if (!editable) {
    return (
      <div className="flex min-w-0 items-center gap-2" onDoubleClick={onOpen}>
        <span className="min-w-0 flex-1">{display}</span>
        {openButton}
      </div>
    );
  }

  if (column.type === "checkbox") {
    return (
      <Checkbox
        aria-label={column.label}
        checked={value === true}
        onCheckedChange={(checked) => void onCommit(checked === true)}
      />
    );
  }

  async function commit() {
    if (JSON.stringify(draft ?? null) === JSON.stringify(value ?? null)) return;
    if (column.required && (draft === null || draft === undefined || draft === "" || (Array.isArray(draft) && !draft.length))) {
      setError(`${column.label} is required`);
      return;
    }
    try {
      await onCommit(draft);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) {
            setDraft(value);
            setError(null);
          } else void commit();
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <button type="button" className="-mx-1.5 min-w-0 flex-1 cursor-text rounded px-1.5 py-1 text-left hover:bg-accent/60" aria-label={`Edit ${column.label}`}>
            {display}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(22rem,calc(100vw-2rem))] p-2"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && (event.target as HTMLElement).tagName === "INPUT") {
              event.preventDefault();
              setOpen(false);
              void commit();
            }
          }}
        >
          <div className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">
              {column.label} · {TYPE_LABELS[column.type]}
            </span>
            <FieldInput column={column} value={draft} onChange={setDraft} invalid={Boolean(error)} />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        </PopoverContent>
      </Popover>
      {openButton}
      {error && !open ? <span className="text-xs text-destructive" title={error}>!</span> : null}
    </div>
  );
}

function QuickAdd({ itemName, onAdd }: { itemName: string; onAdd: (title: string) => Promise<unknown> }) {
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="flex h-10 items-center gap-2 text-muted-foreground"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          await onAdd(value.trim());
          setValue("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Plus className="size-4" />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={busy}
        placeholder={`New ${itemName.toLowerCase()} — type a name and press Enter`}
        aria-label={`New ${itemName}`}
        className="h-8 w-80 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
    </form>
  );
}

function RowMenu({ onOpen, onDuplicate, onDelete }: { onOpen: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-7" aria-label="Row actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onOpen}>
          <Maximize2 /> Open
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  sorted?: "asc" | "desc";
  canWrite: boolean;
  onSort: (direction: "asc" | "desc") => void;
  onEdit: () => void;
  onHide: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn("-mx-2 inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 hover:bg-accent hover:text-foreground", sorted && "text-foreground")}>
          <span className="truncate">{column.label}</span>
          {sorted === "asc" ? <ArrowUp className="size-3.5 shrink-0" /> : sorted === "desc" ? <ArrowDown className="size-3.5 shrink-0" /> : <ChevronDown className="size-3.5 shrink-0 opacity-40" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{TYPE_LABELS[column.type]}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onSort("asc")}>
          <ArrowUp /> Sort ascending
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSort("desc")}>
          <ArrowDown /> Sort descending
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onHide}>
          <EyeOff /> Hide in view
        </DropdownMenuItem>
        {canWrite ? (
          <>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit property
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 /> Delete property
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FooterCell({ column, rows, canWrite, onSet }: { column: ColumnDef; rows: RowView[]; canWrite: boolean; onSet: (kind: Aggregate | undefined) => void }) {
  const kind = column.config.aggregate;
  const values = React.useMemo(() => {
    if (!kind) return [];
    return rows.map((row) => {
      const value = row.values[column.key];
      // Aggregates work on display units for stored numbers.
      return value;
    });
  }, [rows, column.key, kind]);
  const result = kind ? aggregate(column, numericValues(column, values), kind) : null;
  const label = kind ? (
    <span className="truncate">
      <span className="text-muted-foreground">{AGGREGATE_LABELS[kind]}</span> <span className="tabular-nums text-foreground">{result}</span>
    </span>
  ) : (
    <span className="opacity-0 group-hover/footer:opacity-100">Calculate</span>
  );
  if (!canWrite) return <div className="truncate px-2 text-xs">{kind ? label : null}</div>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="group/footer flex h-8 w-full items-center justify-end rounded px-2 text-xs text-muted-foreground hover:bg-accent">
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onSet(undefined)}>None</DropdownMenuItem>
        {aggregatesFor(column).map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onSet(option)}>
            {AGGREGATE_LABELS[option]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Stored numbers stay scaled; aggregate() formats them per column. */
function numericValues(column: ColumnDef, values: unknown[]): unknown[] {
  return column.type === "relation" ? values.map((value) => (Array.isArray(value) && value.length ? value : null)) : values;
}

export type { RowValues };
