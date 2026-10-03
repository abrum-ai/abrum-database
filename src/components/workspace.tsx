import React from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Columns3,
  Copy,
  Eye,
  EyeOff,
  FileDown,
  FileUp,
  Filter,
  GalleryVerticalEnd,
  Kanban,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  FILTER_OPS,
  OPTION_TYPES,
  TYPE_LABELS,
  download,
  imageColumn,
  isComputed,
  matchesFilter,
  opsFor,
  primaryColumn,
  slugKey,
  sortValue,
  textValue,
  toCsv,
  toJsonRows,
  type ColumnDef,
  type FilterOp,
  type RowFilter,
  type RowValues,
} from "@/lib/columns";
import { relatedTableKeys, useComputedRows, useTableRows, type Database, type RowView, type StoredRow } from "@/lib/data";
import { TableContextProvider } from "@/lib/table-context";
import { LAYOUT_LABELS, LAYOUTS, viewColumns, withColumnSettings, type Layout, type ViewConfig, type ViewDef, type ViewSort } from "@/lib/views";
import { ColumnDialog, type ColumnDraft } from "./column-dialog";
import { ImportDialog } from "./import-dialog";
import { NewItemDialog, RowSheet } from "./item-forms";
import { BoardLayout, GalleryLayout, ListLayout } from "./layouts/card-layouts";
import { TableLayout } from "./layouts/table-layout";

const LAYOUT_ICONS: Record<Layout, React.ComponentType<{ className?: string }>> = { table: Table2, board: Kanban, gallery: GalleryVerticalEnd, list: List };

/** Loads the rows of a related table and reports them upward. */
function RelatedSource({ tableKey, onRows }: { tableKey: string; onRows: (tableKey: string, rows: StoredRow[]) => void }) {
  const { rows } = useTableRows(tableKey);
  // Report only real content changes; an identity change alone must not
  // re-render the parent (that loop crashed tables with relations).
  const signature = rows.map((row) => `${row.id}:${row.updatedAtMs}`).join("|");
  React.useEffect(() => onRows(tableKey, rows), [tableKey, signature, onRows]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function TableWorkspace({ db, tableKey, canWrite, tabs }: { db: Database; tableKey: string; canWrite: boolean; tabs: React.ReactNode }) {
  const table = db.tables.find((item) => item.key === tableKey)!;
  const itemName = table.itemName;
  const columns = db.columnsFor(tableKey);
  const views = db.viewsFor(tableKey);
  const data = useTableRows(tableKey);

  // Related tables (relations and rollups, two hops).
  const relatedKeys = relatedTableKeys(tableKey, db.columnsFor).filter((key) => db.tables.some((item) => item.key === key));
  const [relatedRows, setRelatedRows] = React.useState<Map<string, StoredRow[]>>(new Map());
  const onRelatedRows = React.useCallback((key: string, rows: StoredRow[]) => {
    setRelatedRows((current) => (current.get(key) === rows ? current : new Map(current).set(key, rows)));
  }, []);
  const related = React.useMemo(() => {
    const map = new Map<string, StoredRow[]>();
    for (const key of relatedKeys) if (relatedRows.has(key)) map.set(key, relatedRows.get(key)!);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatedRows, relatedKeys.join("|")]);
  const computed = useComputedRows(tableKey, columns, data.rows, related, db.columnsFor);
  const contextRelated = React.useMemo(() => new Map(related).set(tableKey, data.rows), [related, tableKey, data.rows]);
  const tableNames = React.useMemo(() => new Map(db.tables.map((item) => [item.key, item.name])), [db.tables]);

  // Active view with optimistic local edits that are saved in the background.
  const [viewKey, setViewKey] = React.useState(views[0].key);
  const savedView = views.find((view) => view.key === viewKey) ?? views[0];
  const [draft, setDraft] = React.useState<ViewConfig | null>(null);
  const view: ViewDef = { ...savedView, config: draft ?? savedView.config };
  const saveTimer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => setDraft(null), [savedView.key, savedView.config]);
  const changeView = React.useCallback(
    (config: ViewConfig) => {
      setDraft(config);
      if (!canWrite) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void db.updateView(tableKey, savedView.key, savedView.persisted ? { config } : { name: savedView.name, layout: savedView.layout, config });
      }, 400);
    },
    [canWrite, db, tableKey, savedView],
  );

  const [search, setSearch] = React.useState("");
  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [openRowId, setOpenRowId] = React.useState<string | null>(null);
  const [newItem, setNewItem] = React.useState<{ open: boolean; defaults?: RowValues }>({ open: false });
  const [columnDialog, setColumnDialog] = React.useState<{ open: boolean; column: ColumnDef | null }>({ open: false, column: null });
  const [importOpen, setImportOpen] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  React.useEffect(() => setSelection({}), [viewKey]);

  const shown = viewColumns(view, columns);
  const all = viewColumns(view, columns, true);
  const filters = view.config.filters ?? [];
  const sorts = view.config.sorts ?? [];
  const byKey = React.useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns]);

  const visibleRows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    const active = filters.filter((filter) => byKey.has(filter.column));
    let rows = computed.rows.filter((row) => {
      if (active.length) {
        const results = active.map((filter) => matchesFilter(byKey.get(filter.column)!, row.values[filter.column], filter, computed.titles));
        if (view.config.filterMode === "or" ? !results.some(Boolean) : !results.every(Boolean)) return false;
      }
      if (needle) {
        return columns.some((column) => textValue(column, row.values[column.key], computed.titles).toLowerCase().includes(needle)) || row.body.toLowerCase().includes(needle);
      }
      return true;
    });
    const activeSorts = sorts.filter((sort) => byKey.has(sort.column));
    if (activeSorts.length) {
      rows = [...rows].sort((a, b) => {
        for (const sort of activeSorts) {
          const column = byKey.get(sort.column)!;
          const left = sortValue(column, a.values[column.key], computed.titles);
          const right = sortValue(column, b.values[column.key], computed.titles);
          if (left === right) continue;
          const emptyLeft = left === Number.NEGATIVE_INFINITY || left === "";
          const emptyRight = right === Number.NEGATIVE_INFINITY || right === "";
          if (emptyLeft !== emptyRight) return emptyLeft ? 1 : -1;
          return (left > right ? 1 : -1) * (sort.direction === "desc" ? -1 : 1);
        }
        return 0;
      });
    }
    return rows;
  }, [computed, search, filters, sorts, byKey, columns, view.config.filterMode]);

  const openRow = computed.rows.find((row) => row.id === openRowId) ?? null;
  const selectedIds = Object.keys(selection).filter((id) => selection[id] && data.rows.some((row) => row.id === id));
  const sections = [...new Set(columns.map((column) => column.config.section).filter((section): section is string => Boolean(section)))];
  const primary = primaryColumn(columns.filter((column) => column.type !== "image" && !isComputed(column)));
  const needsDialog = columns.some((column) => column.required && column.key !== primary?.key && !isComputed(column) && column.type !== "checkbox");

  async function guard<T>(operation: () => Promise<T>) {
    setFailure(null);
    try {
      return await operation();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    }
  }

  async function updateCell(id: string, key: string, value: unknown) {
    const row = data.rows.find((item) => item.id === id);
    if (!row) return;
    await guard(() => data.updateRow(id, { values: { ...row.values, [key]: value } }));
  }

  async function saveColumn(draftColumn: ColumnDraft) {
    const current = columnDialog.column;
    if (!current) {
      const key = await db.addColumn(tableKey, draftColumn);
      // Make sure a new property shows up in a view that lists its columns explicitly.
      if (view.config.columns?.length) changeView(withColumnSettings(view, columns, (list) => [...list, { key }]));
      return;
    }
    if (current.type !== draftColumn.type) await db.changeColumnType(tableKey, current.key, draftColumn);
    else await db.updateColumn(tableKey, current.key, draftColumn);
  }

  const exportRows = selectedIds.length ? visibleRows.filter((row) => selection[row.id]) : visibleRows;
  const fileBase = slugKey(`${table.name} ${view.name}`) || "table";

  const layoutProps = { columns: shown, allColumns: all, rows: visibleRows, onOpenRow: setOpenRowId };
  let body: React.ReactNode;
  if (view.layout === "board") {
    body = (
      <BoardLayout
        {...layoutProps}
        groupBy={view.config.groupBy}
        coverKey={view.config.cover}
        cardColumns={view.config.cardColumns}
        onMoveRow={(id, key, value) => updateCell(id, key, value)}
        onNewInGroup={(key, value) => setNewItem({ open: true, defaults: value === null ? {} : { [key]: value } })}
      />
    );
  } else if (view.layout === "gallery") {
    body = <GalleryLayout {...layoutProps} coverKey={view.config.cover} cardColumns={view.config.cardColumns} />;
  } else if (view.layout === "list") {
    body = <ListLayout columns={shown} rows={visibleRows} cardColumns={view.config.cardColumns} onOpenRow={setOpenRowId} />;
  } else {
    body = (
      <TableLayout
        itemName={itemName}
        columns={shown}
        rows={visibleRows}
        totalRows={data.rows.length}
        sorts={sorts}
        selection={selection}
        onSelectionChange={setSelection}
        onSort={(next) => changeView({ ...view.config, sorts: next })}
        onOpenRow={setOpenRowId}
        onUpdateCell={updateCell}
        onQuickAdd={async (title) => {
          if (needsDialog || !primary) {
            setNewItem({ open: true, defaults: primary && title ? { [primary.key]: title } : {} });
            return;
          }
          const id = await guard(() => data.createRow(title ? { [primary.key]: title } : {}));
          if (!title) setOpenRowId(id);
        }}
        onDuplicateRow={(id) => guard(() => data.duplicateRow(id))}
        onDeleteRows={(ids) => guard(() => data.deleteRows(ids))}
        onAddColumn={() => setColumnDialog({ open: true, column: null })}
        onEditColumn={(column) => setColumnDialog({ open: true, column })}
        onHideColumn={(column) => changeView(withColumnSettings(view, columns, (list) => list.map((entry) => (entry.key === column.key ? { ...entry, hidden: true } : entry))))}
        onDeleteColumn={(column) => {
          if (window.confirm(`Delete the property “${column.label}” for everyone? Stored values stay in the rows but are no longer shown.`)) {
            void guard(() => db.removeColumn(tableKey, column.key));
          }
        }}
        onResizeColumns={(widths) => changeView(withColumnSettings(view, columns, (list) => list.map((entry) => (widths[entry.key] ? { ...entry, width: widths[entry.key] } : entry))))}
        onMoveColumn={(key, beforeKey) =>
          changeView(
            withColumnSettings(view, columns, (list) => {
              const moving = list.find((entry) => entry.key === key)!;
              const rest = list.filter((entry) => entry.key !== key);
              const index = beforeKey ? rest.findIndex((entry) => entry.key === beforeKey) : rest.length;
              rest.splice(index < 0 ? rest.length : index, 0, moving);
              return rest;
            }),
          )
        }
        onSetAggregate={(column, kind) => void guard(() => db.updateColumn(tableKey, column.key, { config: { ...column.config, aggregate: kind } }))}
      />
    );
  }

  return (
    <TableContextProvider titles={computed.titles} related={contextRelated} tableNames={tableNames} columnsFor={db.columnsFor} canWrite={canWrite}>
      {relatedKeys.map((key) => (
        <RelatedSource key={key} tableKey={key} onRows={onRelatedRows} />
      ))}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-stretch gap-1 border-b px-4 sm:px-6">
          <div className="flex min-w-0 items-stretch gap-1 overflow-x-auto">{tabs}</div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
              <ViewSwitcher
                views={views}
                active={view.key}
                canWrite={canWrite}
                onSelect={setViewKey}
                onCreate={async (layout) => {
                  const groupBy = columns.find((column) => column.type === "select" || column.type === "person")?.key;
                  const key = await guard(() =>
                    db.createView(tableKey, { name: LAYOUT_LABELS[layout], layout, config: layout === "board" && groupBy ? { groupBy } : {} }),
                  );
                  setViewKey(key);
                }}
                onRename={(target, name) => void guard(() => db.updateView(tableKey, target.key, target.persisted ? { name } : { name, layout: target.layout, config: target.config }))}
                onDuplicate={async (target) => setViewKey(await guard(() => db.createView(tableKey, { name: `${target.name} copy`, layout: target.layout, config: target.key === view.key ? view.config : target.config })))}
                onDelete={(target) => {
                  if (views.length > 1 && window.confirm(`Delete the view “${target.name}”?`)) {
                    void guard(() => db.deleteView(tableKey, target.key));
                    setViewKey(views.find((item) => item.key !== target.key)!.key);
                  }
                }}
                onLayout={(target, layout) => {
                  const groupBy = target.config.groupBy ?? columns.find((column) => column.type === "select" || column.type === "person")?.key;
                  void guard(() =>
                    db.updateView(tableKey, target.key, {
                      ...(target.persisted ? {} : { name: target.name }),
                      layout,
                      config: layout === "board" && groupBy ? { ...target.config, groupBy } : target.config,
                    }),
                  );
                }}
              />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
            {data.isLoadingMore ? (
              <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground" title={`Loading ${data.rows.length.toLocaleString()}…`}>
                <Loader2 className="size-3.5 animate-spin" />
              </span>
            ) : null}
            <InlineSearch value={search} onChange={setSearch} placeholder={`Search ${table.name.toLowerCase()}…`} />
            <FilterMenu columns={all} config={view.config} onChange={changeView} />
            <SortMenu columns={all} sorts={sorts} onChange={(next) => changeView({ ...view.config, sorts: next })} />
            <PropertiesMenu view={view} columns={columns} canWrite={canWrite} onChange={changeView} onAdd={() => setColumnDialog({ open: true, column: null })} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="More view options" title="Group, cover, export and import">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {view.layout === "board" ? (
                      <OptionSubmenu
                        label="Group by"
                        value={view.config.groupBy ?? columns.find((column) => column.type === "select" || column.type === "person")?.key}
                        options={columns.filter((column) => ["select", "person", "checkbox"].includes(column.type))}
                        onChange={(groupBy) => changeView({ ...view.config, groupBy })}
                      />
                    ) : null}
                    {view.layout === "board" || view.layout === "gallery" ? (
                      <OptionSubmenu
                        label="Cover"
                        value={view.config.cover ?? (view.layout === "gallery" ? imageColumn(columns)?.key : undefined)}
                        options={columns.filter((column) => column.type === "image")}
                        allowNone
                        onChange={(cover) => changeView({ ...view.config, cover })}
                      />
                    ) : null}
                    {view.layout === "board" || view.layout === "gallery" ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      Export {selectedIds.length ? `${selectedIds.length} selected` : `${visibleRows.length} in view`}
                    </DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => download(`${fileBase}.csv`, toCsv(shown, exportRows.map((row) => row.values), computed.titles), "text/csv;charset=utf-8")}>
                      <FileDown /> Export CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => download(`${fileBase}.json`, JSON.stringify(toJsonRows(columns, exportRows, computed.titles), null, 2), "application/json")}>
                      <FileDown /> Export JSON
                    </DropdownMenuItem>
                    {canWrite ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                          <FileUp /> Import CSV…
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
            {canWrite ? (
              <Button size="sm" className="ml-1 h-8" onClick={() => setNewItem({ open: true, defaults: {} })} disabled={columns.length === 0}>
                <Plus /> <span className="hidden sm:inline">New {itemName}</span>
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
                  if (!window.confirm(`Delete ${selectedIds.length} ${(selectedIds.length === 1 ? itemName : table.name).toLowerCase()}?`)) return;
                  await guard(() => data.deleteRows(selectedIds));
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

        {data.isLoading && data.rows.length === 0 ? (
          <div className="grid flex-1 place-items-center border-t text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          body
        )}

        <div className="flex items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground sm:px-6">
          <span>
            <span className="text-foreground tabular-nums">{visibleRows.length.toLocaleString()}</span>
            {visibleRows.length !== data.rows.length ? ` of ${data.rows.length.toLocaleString()}` : ""}{" "}
            {(data.rows.length === 1 ? itemName : table.name).toLowerCase()}
          </span>
          {failure || data.error ? <span className="ml-auto text-destructive">{failure ?? data.error}</span> : null}
        </div>
      </div>

      <NewItemDialog
        open={newItem.open}
        onOpenChange={(open) => setNewItem((current) => ({ ...current, open }))}
        columns={all}
        itemName={itemName}
        tableName={table.name}
        defaults={newItem.defaults}
        onCreate={(values) => data.createRow(values)}
      />
      <RowSheet
        row={openRow as RowView | null}
        columns={all}
        itemName={itemName}
        onOpenChange={(open) => !open && setOpenRowId(null)}
        onSave={(id, patch) => data.updateRow(id, patch)}
        onDelete={(id) => data.deleteRows([id])}
        onDuplicate={async (id) => {
          const copy = await guard(() => data.duplicateRow(id));
          if (copy) setOpenRowId(copy);
        }}
      />
      <ColumnDialog
        open={columnDialog.open}
        column={columnDialog.column}
        tableKey={tableKey}
        columns={columns}
        tables={db.tables}
        sections={sections}
        onOpenChange={(open) => setColumnDialog((current) => ({ ...current, open }))}
        onSubmit={saveColumn}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} tableKey={tableKey} tableName={table.name} columns={columns} />
    </TableContextProvider>
  );
}

function ViewSwitcher({
  views,
  active,
  canWrite,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onLayout,
}: {
  views: ViewDef[];
  active: string;
  canWrite: boolean;
  onSelect: (key: string) => void;
  onCreate: (layout: Layout) => void;
  onRename: (view: ViewDef, name: string) => void;
  onDuplicate: (view: ViewDef) => void;
  onDelete: (view: ViewDef) => void;
  onLayout: (view: ViewDef, layout: Layout) => void;
}) {
  const current = views.find((view) => view.key === active) ?? views[0];
  const CurrentIcon = LAYOUT_ICONS[current.layout];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 font-medium" aria-label={`View: ${current.name}`}>
          <CurrentIcon className="size-4 text-muted-foreground" />
          <span className="max-w-44 truncate">{current.name}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Views</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current.key} onValueChange={onSelect}>
          {views.map((view) => {
            const Icon = LAYOUT_ICONS[view.layout];
            return (
              <DropdownMenuRadioItem key={view.key} value={view.key}>
                <Icon className="size-4 text-muted-foreground" /> <span className="truncate">{view.name}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        {canWrite ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Plus /> New view
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {LAYOUTS.map((layout) => {
                  const Icon = LAYOUT_ICONS[layout];
                  return (
                    <DropdownMenuItem key={layout} onSelect={() => onCreate(layout)}>
                      <Icon /> {LAYOUT_LABELS[layout]}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <CurrentIcon /> Layout
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={current.layout} onValueChange={(layout) => onLayout(current, layout as Layout)}>
                  {LAYOUTS.map((layout) => (
                    <DropdownMenuRadioItem key={layout} value={layout}>
                      {LAYOUT_LABELS[layout]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onSelect={() => {
                const name = window.prompt("Rename view", current.name)?.trim();
                if (name && name !== current.name) onRename(current, name);
              }}
            >
              <Pencil /> Rename view
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDuplicate(current)}>
              <Copy /> Duplicate view
            </DropdownMenuItem>
            {views.length > 1 ? (
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(current)}>
                <Trash2 /> Delete view
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Search collapses to an icon; it stays open while it holds a query. */
function InlineSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const [open, setOpen] = React.useState(false);
  if (!open && !value) {
    return (
      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Search" title="Search" onClick={() => setOpen(true)}>
        <Search />
      </Button>
    );
  }
  return (
    <div className="relative w-40 sm:w-56">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => !value && setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onChange("");
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="h-8 pr-7 pl-8"
        aria-label="Search rows"
      />
      {value ? (
        <button type="button" className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search" onClick={() => onChange("")}>
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Icon trigger for toolbar popovers; shows a count while something is active. */
const ToolButton = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button> & { label: string; count?: number }>(
  ({ label, count, children, className, ...props }, ref) => (
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      className={cn("h-8 gap-1 px-2 text-muted-foreground", count ? "bg-accent text-foreground" : "", className)}
      aria-label={count ? `${label} (${count})` : label}
      title={label}
      {...props}
    >
      {children}
      {count ? <span className="text-xs tabular-nums">{count}</span> : null}
    </Button>
  ),
);
ToolButton.displayName = "ToolButton";

function FilterMenu({ columns, config, onChange }: { columns: ColumnDef[]; config: ViewConfig; onChange: (config: ViewConfig) => void }) {
  const filterable = columns.filter((column) => column.type !== "image" && column.type !== "trend");
  const filters = (config.filters ?? []).filter((filter) => filterable.some((column) => column.key === filter.column));
  const set = (next: RowFilter[]) => onChange({ ...config, filters: next });
  const update = (index: number, patch: Partial<RowFilter>) => set(filters.map((filter, position) => (position === index ? { ...filter, ...patch } : filter)));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolButton label="Filter" count={filters.length}>
          <Filter />
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(38rem,calc(100vw-2rem))] p-3">
        <div className="grid gap-2">
          {filters.length === 0 ? <p className="text-sm text-muted-foreground">No filters. Filters are saved with this view for everyone.</p> : null}
          {filters.map((filter, index) => {
            const column = filterable.find((item) => item.key === filter.column)!;
            return (
              <div key={index} className="flex flex-wrap items-center gap-2">
                {index === 0 ? (
                  <span className="w-14 text-sm text-muted-foreground">Where</span>
                ) : index === 1 ? (
                  <Select value={config.filterMode ?? "and"} onValueChange={(mode) => onChange({ ...config, filterMode: mode as "and" | "or" })}>
                    <SelectTrigger size="sm" className="w-14 px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="and">and</SelectItem>
                      <SelectItem value="or">or</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="w-14 text-sm text-muted-foreground">{config.filterMode ?? "and"}</span>
                )}
                <Select
                  value={column.key}
                  onValueChange={(key) => {
                    const next = filterable.find((item) => item.key === key)!;
                    update(index, { column: key, op: opsFor(next)[0], value: "" });
                  }}
                >
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {filterable.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filter.op} onValueChange={(op) => update(index, { op: op as FilterOp })}>
                  <SelectTrigger size="sm" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {opsFor(column).map((op) => (
                      <SelectItem key={op} value={op}>
                        {FILTER_OPS[op]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filter.op === "empty" || filter.op === "notEmpty" ? null : <FilterValue column={column} value={String(filter.value ?? "")} onChange={(value) => update(index, { value })} />}
                <Button size="icon" variant="ghost" className="size-8" aria-label="Remove filter" onClick={() => set(filters.filter((_, position) => position !== index))}>
                  <X />
                </Button>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={filterable.length === 0}
              onClick={() => {
                const column = primaryColumn(filterable) ?? filterable[0];
                set([...filters, { column: column.key, op: opsFor(column)[0], value: "" }]);
              }}
            >
              <Plus /> Add filter
            </Button>
            {filters.length ? (
              <Button size="sm" variant="ghost" onClick={() => set([])}>
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
  if (OPTION_TYPES.has(column.type)) {
    return (
      <Select value={value || "__any"} onValueChange={(next) => onChange(next === "__any" ? "" : next)}>
        <SelectTrigger size="sm" className="w-40">
          <SelectValue placeholder="Any" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__any">Any</SelectItem>
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

function SortMenu({ columns, sorts, onChange }: { columns: ColumnDef[]; sorts: ViewSort[]; onChange: (sorts: ViewSort[]) => void }) {
  const sortable = columns.filter((column) => column.type !== "image");
  const active = sorts.filter((sort) => sortable.some((column) => column.key === sort.column));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolButton label="Sort" count={active.length}>
          <ArrowUpDown />
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-3">
        <div className="grid gap-2">
          {active.length === 0 ? <p className="text-sm text-muted-foreground">Rows are in creation order.</p> : null}
          {active.map((sort, index) => (
            <div key={index} className="flex items-center gap-2">
              <Select value={sort.column} onValueChange={(column) => onChange(active.map((item, position) => (position === index ? { ...item, column } : item)))}>
                <SelectTrigger size="sm" className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortable.map((column) => (
                    <SelectItem key={column.key} value={column.key}>
                      {column.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onChange(active.map((item, position) => (position === index ? { ...item, direction: item.direction === "asc" ? "desc" : "asc" } : item)))}
              >
                {sort.direction === "asc" ? <ArrowUp /> : <ArrowDown />} {sort.direction === "asc" ? "Ascending" : "Descending"}
              </Button>
              <Button size="icon" variant="ghost" className="size-8" aria-label="Remove sort" onClick={() => onChange(active.filter((_, position) => position !== index))}>
                <X />
              </Button>
            </div>
          ))}
          <div className="flex justify-between pt-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const next = sortable.find((column) => !active.some((sort) => sort.column === column.key));
                if (next) onChange([...active, { column: next.key, direction: "asc" }]);
              }}
            >
              <Plus /> Add sort
            </Button>
            {active.length ? (
              <Button size="sm" variant="ghost" onClick={() => onChange([])}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PropertiesMenu({ view, columns, canWrite, onChange, onAdd }: { view: ViewDef; columns: ColumnDef[]; canWrite: boolean; onChange: (config: ViewConfig) => void; onAdd: () => void }) {
  const list = viewColumns(view, columns, true);
  const hiddenCount = list.filter((column) => column.hidden).length;
  const update = (fn: Parameters<typeof withColumnSettings>[2]) => onChange(withColumnSettings(view, columns, fn));
  const move = (key: string, delta: number) =>
    update((entries) => {
      const index = entries.findIndex((entry) => entry.key === key);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= entries.length) return entries;
      const next = [...entries];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolButton label={hiddenCount ? `Properties, ${hiddenCount} hidden` : "Properties"} count={hiddenCount}>
          <Columns3 />
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="max-h-80 overflow-y-auto">
          {list.map((column, index) => (
            <div key={column.key} className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent/60">
              <span className="min-w-0 flex-1 truncate text-sm">{column.label}</span>
              <span className="text-xs text-muted-foreground">{TYPE_LABELS[column.type]}</span>
              <Button size="icon" variant="ghost" className="size-7" aria-label={`Move ${column.label} up`} disabled={index === 0} onClick={() => move(column.key, -1)}>
                <ArrowUp />
              </Button>
              <Button size="icon" variant="ghost" className="size-7" aria-label={`Move ${column.label} down`} disabled={index === list.length - 1} onClick={() => move(column.key, 1)}>
                <ArrowDown />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={column.hidden ? `Show ${column.label}` : `Hide ${column.label}`}
                onClick={() => update((entries) => entries.map((entry) => (entry.key === column.key ? { ...entry, hidden: !column.hidden || undefined } : entry)))}
              >
                {column.hidden ? <EyeOff className="text-muted-foreground" /> : <Eye />}
              </Button>
            </div>
          ))}
        </div>
        {canWrite ? (
          <Button size="sm" variant="ghost" className="mt-1 w-full justify-start" onClick={onAdd}>
            <Plus /> Add property
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function OptionSubmenu({ label, value, options, allowNone, onChange }: { label: string; value?: string; options: ColumnDef[]; allowNone?: boolean; onChange: (value: string | undefined) => void }) {
  const current = options.find((column) => column.key === value);
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex-1">{label}</span>
        <span className="max-w-24 truncate text-xs text-muted-foreground">{current?.label ?? "None"}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        <DropdownMenuRadioGroup value={value ?? "__none"} onValueChange={(next) => onChange(next === "__none" ? undefined : next)}>
          {allowNone || options.length === 0 ? <DropdownMenuRadioItem value="__none">None</DropdownMenuRadioItem> : null}
          {options.map((column) => (
            <DropdownMenuRadioItem key={column.key} value={column.key}>
              {column.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
