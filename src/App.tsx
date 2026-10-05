import React from "react";
import { AbrumAppShell, AbrumAppReady, processAffordance, useAbrumCanWrite, useAbrumSnapshot, useAbrumSidebarNavigation, useAbrumRoomActions } from "@abrum/react";
import { Database as DatabaseIcon, Loader2, MoreHorizontal, Pencil, Plus, Table2, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDatabase, type Database } from "@/lib/data";
import { TEMPLATES, type Template } from "@/lib/templates";
import { TableWorkspace } from "@/components/workspace";
import { databaseSidebarItems, tableNavigationId } from "@/lib/sidebar";

export function App() {
  const db = useDatabase();
  const canWrite = useAbrumCanWrite();
  const snapshot = useAbrumSnapshot();
  const roomId = snapshot.selectedRoomId;
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [newTableOpen, setNewTableOpen] = React.useState(false);
  const [tableAction, setTableAction] = React.useState<{ itemId: string; action: "rename" | "delete" } | null>(null);
  const active = db.tables.find((table) => table.key === activeKey) ?? db.tables[0] ?? null;
  const sidebarItems = React.useMemo(() => databaseSidebarItems(roomId, db.tables, canWrite), [roomId, db.tables, canWrite]);
  const selectSidebarTable = React.useCallback((itemId: string) => {
    const table = roomId ? db.tables.find(table => tableNavigationId(roomId, table) === itemId) : null;
    if (table) setActiveKey(table.key);
  }, [roomId, db.tables]);
  const sidebarAction = React.useCallback((itemId: string, actionId: string) => {
    if (!canWrite || !roomId || !db.tables.some(table => tableNavigationId(roomId, table) === itemId)) return;
    if (actionId === "table.rename" || actionId === "table.delete") {
      setTableAction({ itemId, action: actionId === "table.rename" ? "rename" : "delete" });
    }
  }, [canWrite, roomId, db.tables]);
  const hostOwnsSidebar = useAbrumSidebarNavigation({
    items: sidebarItems,
    activeItemId: active && roomId ? tableNavigationId(roomId, active) : "",
    onSelect: selectSidebarTable,
    onAction: sidebarAction,
  });
  useAbrumRoomActions({ "table.create": () => {
    if (!canWrite) throw new Error("You need Write access to add a table.");
    setNewTableOpen(true);
  } });
  const actionTable = roomId && tableAction ? db.tables.find(table => tableNavigationId(roomId, table) === tableAction.itemId) : undefined;

  async function createFromTemplate(template: Template, name: string) {
    const key = await db.createTable({ name, itemName: template.itemName, columns: template.columns });
    setActiveKey(key);
  }

  return (
    <TooltipProvider>
      <AbrumAppShell appName="Database">
        <AbrumAppReady />
        <div
          className="flex h-full min-h-0 flex-col"
          {...processAffordance("tables", {
            phase: db.error ? "error" : db.isLoading ? "loading" : "ready",
            busy: db.isLoading,
            availableActions: ["table.create", "row.create", "row.open", "column.add", "view.create"],
            blockers: db.error ? [db.error] : [],
          })}
        >
          {db.isLoading && db.tables.length === 0 ? (
            <div className="grid flex-1 place-items-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : active ? (
            <TableWorkspace
              key={active.key}
              db={db}
              tableKey={active.key}
              canWrite={canWrite}
              tabs={hostOwnsSidebar ? null : (
                <nav className="flex items-stretch gap-1" aria-label="Tables">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Choose table"><DatabaseIcon /> {active.name}</Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuRadioGroup value={active.key} onValueChange={setActiveKey}>
                        {db.tables.map(table => <DropdownMenuRadioItem key={table.key} value={table.key}>{table.name}</DropdownMenuRadioItem>)}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {canWrite ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button size="icon" variant="ghost" className="size-7" aria-label="Add table" title="Add table" onClick={() => setNewTableOpen(true)}>
                        <Plus />
                      </Button>
                      <TableMenu key={active.key} db={db} tableKey={active.key} name={active.name} itemName={active.itemName} />
                    </div>
                  ) : null}
                </nav>
              )}
            />
          ) : (
            <EmptyState canWrite={canWrite} onCreate={createFromTemplate} />
          )}
          {db.error ? <p className="px-6 py-2 text-sm text-destructive">{db.error}</p> : null}
        </div>
        <NewTableDialog open={newTableOpen} onOpenChange={setNewTableOpen} onCreate={createFromTemplate} />
        {tableAction ? <TableActionDialog key={`${tableAction.itemId}:${tableAction.action}`}
          action={tableAction.action} table={actionTable} canWrite={canWrite} db={db} onClose={() => setTableAction(null)} /> : null}
      </AbrumAppShell>
    </TooltipProvider>
  );
}

function TableActionDialog({ action, table, canWrite, db, onClose }: {
  action: "rename" | "delete"; table?: Database["tables"][number]; canWrite: boolean; db: Database; onClose: () => void;
}) {
  const [name, setName] = React.useState(table?.name ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent>
      <form className="grid gap-4" onSubmit={async event => {
        event.preventDefault();
        if (!table || !canWrite || busy) return;
        setBusy(true); setError(null);
        try {
          if (action === "rename") await db.updateTable(table.key, { name: name.trim() });
          else await db.deleteTable(table.key);
          onClose();
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setBusy(false); }
      }}>
        <DialogHeader>
          <DialogTitle>{action === "rename" ? "Rename table" : `Delete “${table?.name ?? "table"}”?`}</DialogTitle>
          <DialogDescription>{!table ? "This table is no longer available." : action === "rename"
            ? "The new name is shared with everyone who can access this Database."
            : "The table and all its rows, properties and views will be deleted for every collaborator. This cannot be undone."}</DialogDescription>
        </DialogHeader>
        {action === "rename" && table ? <div className="grid gap-2">
          <Label htmlFor="rename-table">Name</Label><Input id="rename-table" value={name} onChange={event => setName(event.target.value)} autoFocus maxLength={80} disabled={busy} />
        </div> : null}
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant={action === "delete" ? "destructive" : "default"} disabled={busy || !table || !canWrite || (action === "rename" && !name.trim())}>
            {busy ? <Loader2 className="animate-spin" /> : null}{action === "rename" ? "Save" : "Delete table"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function TableMenu({ db, tableKey, name, itemName }: { db: Database; tableKey: string; name: string; itemName: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label={`${name} options`} title="Table options">
          {busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            const next = window.prompt("Rename table", name)?.trim();
            if (next && next !== name) void db.updateTable(tableKey, { name: next });
          }}
        >
          <Pencil /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            const next = window.prompt("Name of one item (e.g. Company, Task)", itemName)?.trim();
            if (next && next !== itemName) void db.updateTable(tableKey, { itemName: next });
          }}
        >
          <Tag /> Item name
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            if (!window.confirm(`Delete “${name}” with all its rows, properties and views? This cannot be undone.`)) return;
            setBusy(true);
            try {
              await db.deleteTable(tableKey);
            } catch (cause) {
              window.alert(cause instanceof Error ? cause.message : String(cause));
            } finally {
              setBusy(false);
            }
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
          className="grid content-start gap-1.5 rounded-lg border p-4 text-left transition-colors hover:bg-accent disabled:opacity-60"
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
    <div className="mx-auto grid w-full max-w-3xl content-center gap-6 overflow-y-auto px-6 py-16">
      <div className="grid gap-2">
        <h1 className="text-xl font-semibold">Create your first table</h1>
        <p className="text-muted-foreground">
          Tables, properties, views and rows are stored as signed twins in this Room. Start from a template or ask your agent, e.g. “Create a supplier database with logo, rating and contract value”.
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
  const blank = TEMPLATES[TEMPLATES.length - 1];
  const [template, setTemplate] = React.useState<Template>(blank);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) {
      setTemplate(blank);
      setName("");
      setFailure(null);
    }
  }, [open, blank]);
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
            <DialogDescription>Pick a starting point. You and your agents can add and change properties any time.</DialogDescription>
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
                <span className="text-muted-foreground">{item.columns.length} properties</span>
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
