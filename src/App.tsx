import React from "react";
import { AbrumAppShell, AbrumAppReady, processAffordance, useAbrumCanWrite, useAbrumMutations } from "@abrum/react";
import { app } from "@abrum/generated";
import type { JsonValue } from "@abrum/web-runtime";
import { Loader2, MoreHorizontal, Pencil, Plus, Table2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { newRowId, type ColumnDef } from "@/lib/columns";
import { useRows, useTables } from "@/lib/data";
import { TEMPLATES, templateRows, type Template } from "@/lib/templates";
import { ColumnDialog, type ColumnDraft } from "@/components/column-dialog";
import { DataTable } from "@/components/data-table";
import { ItemSheet, NewItemDialog } from "@/components/item-forms";

export function App() {
  const data = useTables();
  const canWrite = useAbrumCanWrite();
  const mutations = useAbrumMutations(app);
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [newTableOpen, setNewTableOpen] = React.useState(false);
  const active = data.tables.find((table) => table.key === activeKey) ?? data.tables[0] ?? null;

  async function createFromTemplate(template: Template, name: string) {
    const created = await data.createTable({ name, itemName: template.itemName, columns: template.columns });
    const now = Date.now();
    for (const [index, values] of templateRows(template, created.columnKeys).entries()) {
      await mutations.row.create({ tableKey: created.key, id: newRowId(), values: values as JsonValue, createdAtMs: now + index, updatedAtMs: now });
    }
    setActiveKey(created.key);
  }

  return (
    <TooltipProvider>
      <AbrumAppShell appName="Table">
        <AbrumAppReady />
        <div
          className="flex h-full min-h-[480px] flex-col"
          {...processAffordance("tables", {
            phase: data.error ? "error" : data.isLoading ? "loading" : "ready",
            busy: data.isLoading,
            availableActions: ["table.create", "row.create", "row.open", "column.add"],
            blockers: data.error ? [data.error] : [],
          })}
        >
          {data.tables.length > 0 ? (
            <nav className="flex items-center gap-1 overflow-x-auto border-b px-4 sm:px-6" aria-label="Tables">
              {data.tables.map((table) => (
                <button
                  key={table.key}
                  type="button"
                  onClick={() => setActiveKey(table.key)}
                  className={cn(
                    "relative -mb-px shrink-0 border-b-2 px-2 py-3 text-sm transition-colors",
                    table.key === active?.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {table.name}
                </button>
              ))}
              {canWrite ? (
                <Button size="icon" variant="ghost" className="ml-1 size-7 shrink-0" aria-label="New table" onClick={() => setNewTableOpen(true)}>
                  <Plus />
                </Button>
              ) : null}
              {active && canWrite ? <TableMenu key={active.key} tableKey={active.key} name={active.name} data={data} /> : null}
            </nav>
          ) : null}

          {data.isLoading && data.tables.length === 0 ? (
            <div className="grid flex-1 place-items-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : active ? (
            <TableView key={active.key} tableKey={active.key} tableName={active.name} itemName={active.itemName || "Item"} data={data} canWrite={canWrite} />
          ) : (
            <EmptyState canWrite={canWrite} onCreate={createFromTemplate} />
          )}
          {data.error ? <p className="px-6 py-2 text-sm text-destructive">{data.error}</p> : null}
        </div>
        <NewTableDialog open={newTableOpen} onOpenChange={setNewTableOpen} onCreate={createFromTemplate} />
      </AbrumAppShell>
    </TooltipProvider>
  );
}

function TableView({
  tableKey,
  tableName,
  itemName,
  data,
  canWrite,
}: {
  tableKey: string;
  tableName: string;
  itemName: string;
  data: ReturnType<typeof useTables>;
  canWrite: boolean;
}) {
  const rows = useRows(tableKey);
  const columns: ColumnDef[] = data.columnsFor(tableKey).map((column) => column.def);
  const [openRowId, setOpenRowId] = React.useState<string | null>(null);
  const [newItemOpen, setNewItemOpen] = React.useState(false);
  const [columnDialog, setColumnDialog] = React.useState<{ open: boolean; column: ColumnDef | null }>({ open: false, column: null });
  const openRow = rows.rows.find((row) => row.id === openRowId) ?? null;
  const sections = [...new Set(columns.map((column) => column.config.section).filter((section): section is string => Boolean(section)))];

  async function saveColumn(draft: ColumnDraft) {
    if (columnDialog.column) await data.updateColumn(tableKey, columnDialog.column.key, draft);
    else await data.addColumn(tableKey, draft);
  }

  return (
    <>
      <DataTable
        tableName={tableName}
        itemName={itemName}
        columns={columns}
        rows={rows.rows}
        canWrite={canWrite}
        onOpenRow={setOpenRowId}
        onNewItem={() => setNewItemOpen(true)}
        onAddColumn={() => setColumnDialog({ open: true, column: null })}
        onEditColumn={(column) => setColumnDialog({ open: true, column })}
        onHideColumn={(column, hidden) => void data.updateColumn(tableKey, column.key, { hidden })}
        onDeleteColumn={(column) => {
          if (window.confirm(`Delete the column “${column.label}”? Values stay in the rows but are no longer shown.`)) void data.removeColumn(tableKey, column.key);
        }}
        onDeleteRows={(ids) => rows.deleteRows(ids)}
      />
      {rows.error ? <p className="px-6 py-2 text-sm text-destructive">{rows.error}</p> : null}
      <NewItemDialog open={newItemOpen} onOpenChange={setNewItemOpen} columns={columns} itemName={itemName} tableName={tableName} onCreate={rows.createRow} />
      <ItemSheet
        row={openRow}
        columns={columns}
        itemName={itemName}
        onOpenChange={(open) => !open && setOpenRowId(null)}
        onSave={rows.updateRow}
        onDelete={(id) => rows.deleteRows([id])}
      />
      <ColumnDialog
        open={columnDialog.open}
        column={columnDialog.column}
        sections={sections}
        onOpenChange={(open) => setColumnDialog((current) => ({ ...current, open }))}
        onSubmit={saveColumn}
      />
    </>
  );
}

function TableMenu({ tableKey, name, data }: { tableKey: string; name: string; data: ReturnType<typeof useTables> }) {
  const rows = useRows(tableKey);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="ml-auto size-7 shrink-0" aria-label={`${name} options`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            const next = window.prompt("Rename table", name)?.trim();
            if (next && next !== name) void data.renameTable(tableKey, next);
          }}
        >
          <Pencil /> Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            if (window.confirm(`Delete “${name}” with all ${rows.rows.length} rows?`)) void data.deleteTable(tableKey, rows.rows);
          }}
        >
          <Trash2 /> Delete table
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TemplatePicker({ onPick, busy }: { onPick: (template: Template) => void; busy: string | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          disabled={Boolean(busy)}
          onClick={() => onPick(template)}
          className="grid gap-1.5 rounded-lg border p-4 text-left transition-colors hover:bg-accent disabled:opacity-60"
        >
          <span className="flex items-center gap-2 font-medium">
            {busy === template.id ? <Loader2 className="size-4 animate-spin" /> : <Table2 className="size-4 text-muted-foreground" />}
            {template.id === "blank" ? "Blank table" : template.name}
          </span>
          <span className="text-sm text-muted-foreground">{template.description}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ canWrite, onCreate }: { canWrite: boolean; onCreate: (template: Template, name: string) => Promise<void> }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  return (
    <div className="mx-auto grid w-full max-w-3xl content-center gap-6 px-6 py-16">
      <div className="grid gap-2">
        <h1 className="text-xl font-semibold">Create your first table</h1>
        <p className="text-muted-foreground">
          Every table, column and row is stored as a signed twin in this Room. Start from a template or ask your agent to build one, e.g. “Create a table of suppliers with logo, rating and contract value”.
        </p>
      </div>
      {canWrite ? (
        <TemplatePicker
          busy={busy}
          onPick={async (template) => {
            setBusy(template.id);
            setFailure(null);
            try {
              await onCreate(template, template.name);
            } catch (cause) {
              setFailure(cause instanceof Error ? cause.message : String(cause));
            } finally {
              setBusy(null);
            }
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">You can read this Room but not create tables.</p>
      )}
      {failure ? <p className="text-sm text-destructive">{failure}</p> : null}
    </div>
  );
}

function NewTableDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; onCreate: (template: Template, name: string) => Promise<void> }) {
  const [template, setTemplate] = React.useState<Template>(TEMPLATES[TEMPLATES.length - 1]);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) {
      setTemplate(TEMPLATES[TEMPLATES.length - 1]);
      setName("");
      setFailure(null);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form
          className="grid gap-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setFailure(null);
            try {
              await onCreate(template, name.trim() || template.name);
              onOpenChange(false);
            } catch (cause) {
              setFailure(cause instanceof Error ? cause.message : String(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New table</DialogTitle>
            <DialogDescription>Pick a starting point. You and your agents can add and change columns any time.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTemplate(item)}
                className={cn("grid gap-1 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent", item.id === template.id && "border-foreground/40 bg-accent")}
              >
                <span className="font-medium">{item.id === "blank" ? "Blank" : item.name}</span>
                <span className="text-muted-foreground">{item.columns.length} columns</span>
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="table-name">Name</Label>
            <Input id="table-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={template.name} autoFocus />
          </div>
          <DialogFooter className="items-center">
            {failure ? <p className="mr-auto text-sm text-destructive">{failure}</p> : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} Create table
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
