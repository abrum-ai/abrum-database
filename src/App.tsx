import React from "react";
import { AbrumAppShell, AbrumAppReady, processAffordance, useAbrumCanWrite } from "@abrum/react";
import { Database as DatabaseIcon, Loader2, MoreHorizontal, Pencil, Plus, Table2, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDatabase, type Database } from "@/lib/data";
import { TEMPLATES, type Template } from "@/lib/templates";
import { TableWorkspace } from "@/components/workspace";

export function App() {
  const db = useDatabase();
  const canWrite = useAbrumCanWrite();
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [newTableOpen, setNewTableOpen] = React.useState(false);
  const active = db.tables.find((table) => table.key === activeKey) ?? db.tables[0] ?? null;

  async function createFromTemplate(template: Template, name: string) {
    const key = await db.createTable({ name, itemName: template.itemName, columns: template.columns });
    setActiveKey(key);
  }

  return (
    <TooltipProvider>
      <AbrumAppShell appName="Table">
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
          {db.tables.length > 0 ? (
            <nav className="flex items-center gap-1 overflow-x-auto border-b px-4 sm:px-6" aria-label="Databases">
              {db.tables.map((table) => (
                <button
                  key={table.key}
                  type="button"
                  onClick={() => setActiveKey(table.key)}
                  className={cn(
                    "relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-3 text-sm transition-colors",
                    table.key === active?.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <DatabaseIcon className="size-3.5" /> {table.name}
                </button>
              ))}
              {canWrite ? (
                <Button size="icon" variant="ghost" className="ml-1 size-7 shrink-0" aria-label="New database" onClick={() => setNewTableOpen(true)}>
                  <Plus />
                </Button>
              ) : null}
              {active && canWrite ? <TableMenu key={active.key} db={db} tableKey={active.key} name={active.name} itemName={active.itemName} /> : null}
            </nav>
          ) : null}

          {db.isLoading && db.tables.length === 0 ? (
            <div className="grid flex-1 place-items-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : active ? (
            <TableWorkspace key={active.key} db={db} tableKey={active.key} canWrite={canWrite} />
          ) : (
            <EmptyState canWrite={canWrite} onCreate={createFromTemplate} />
          )}
          {db.error ? <p className="px-6 py-2 text-sm text-destructive">{db.error}</p> : null}
        </div>
        <NewTableDialog open={newTableOpen} onOpenChange={setNewTableOpen} onCreate={createFromTemplate} />
      </AbrumAppShell>
    </TooltipProvider>
  );
}

function TableMenu({ db, tableKey, name, itemName }: { db: Database; tableKey: string; name: string; itemName: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="ml-auto size-7 shrink-0" aria-label={`${name} options`}>
          {busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            const next = window.prompt("Rename database", name)?.trim();
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
          <Trash2 /> Delete database
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
            {template.id === "blank" ? "Blank database" : template.name}
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
        <h1 className="text-xl font-semibold">Create your first database</h1>
        <p className="text-muted-foreground">
          Databases, properties, views and rows are stored as signed twins in this Room. Start from a template or ask your agent, e.g. “Create a supplier database with logo, rating and contract value”.
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
        <p className="text-sm text-muted-foreground">You can read this Room but not create databases.</p>
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
            <DialogTitle>New database</DialogTitle>
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
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} Create database
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
