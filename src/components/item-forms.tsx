import React from "react";
import { Loader2, Plus, Rows3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { imageColumn, primaryColumn, textValue, validateValues, type ColumnDef, type RowValues } from "@/lib/columns";
import { CellView, ImageThumb, Monogram, OptionBadge } from "./cells";
import { Field } from "./field-input";

/** Columns grouped by `config.section`, keeping column order. */
function sections(columns: ColumnDef[]) {
  const groups: Array<{ title: string | null; columns: ColumnDef[] }> = [];
  for (const column of columns) {
    const title = column.config.section ?? null;
    const last = groups[groups.length - 1];
    const existing = groups.find((group) => group.title === title);
    if (last && last.title === title) last.columns.push(column);
    else if (existing) existing.columns.push(column);
    else groups.push({ title, columns: [column] });
  }
  return groups;
}

function FormSections({ columns, values, errors, onChange }: { columns: ColumnDef[]; values: RowValues; errors: Record<string, string>; onChange: (key: string, value: unknown) => void }) {
  const primary = primaryColumn(columns.filter((column) => column.type !== "image"));
  return (
    <>
      {sections(columns).map((group, index) => (
        <section key={group.title ?? `section-${index}`} className="grid gap-5 border-b px-6 py-6 last:border-b-0">
          {group.title ? <h3 className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{group.title}</h3> : null}
          <div className="grid gap-5 sm:grid-cols-2">
            {group.columns.map((column) => (
              <Field key={column.key} column={column} wide={column.key === primary?.key} value={values[column.key]} error={errors[column.key]} onChange={(value) => onChange(column.key, value)} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function useFormState(initial: RowValues) {
  const [values, setValues] = React.useState<RowValues>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const reset = React.useCallback((next: RowValues) => {
    setValues(next);
    setErrors({});
    setFailure(null);
  }, []);
  const change = (key: string, value: unknown) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  async function submit(columns: ColumnDef[], action: (values: RowValues) => Promise<unknown>) {
    const found = validateValues(columns, values);
    setErrors(found);
    if (Object.keys(found).length > 0) return false;
    setBusy(true);
    setFailure(null);
    try {
      await action(values);
      return true;
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { values, errors, busy, failure, change, reset, submit };
}

export function NewItemDialog({
  open,
  onOpenChange,
  columns,
  itemName,
  tableName,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnDef[];
  itemName: string;
  tableName: string;
  onCreate: (values: RowValues) => Promise<unknown>;
}) {
  const form = useFormState({});
  React.useEffect(() => {
    if (open) form.reset({});
  }, [open, form.reset]);
  const visible = columns.filter((column) => !column.hidden);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>New {itemName}</DialogTitle>
          <DialogDescription>Add a {itemName.toLowerCase()} to {tableName}. It appears in the list right away.</DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await form.submit(visible, onCreate)) onOpenChange(false);
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FormSections columns={visible} values={form.values} errors={form.errors} onChange={form.change} />
          </div>
          <DialogFooter className="items-center border-t px-6 py-4">
            {form.failure ? <p className="mr-auto text-sm text-destructive">{form.failure}</p> : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.busy}>
              {form.busy ? <Loader2 className="animate-spin" /> : <Plus />} Create {itemName}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ItemSheet({
  row,
  columns,
  itemName,
  onOpenChange,
  onSave,
  onDelete,
}: {
  row: { id: string; values: RowValues } | null;
  columns: ColumnDef[];
  itemName: string;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, values: RowValues) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}) {
  const form = useFormState(row?.values ?? {});
  const rowId = row?.id;
  React.useEffect(() => {
    if (row) form.reset(row.values);
    // Reset only when another row is opened, not on every live update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId]);
  const visible = columns.filter((column) => !column.hidden);
  const title = primaryColumn(visible.filter((column) => column.type !== "image"));
  const image = imageColumn(visible);
  const tagColumns = visible.filter((column) => column.type === "select" || column.type === "multiSelect");
  const dirty = row ? JSON.stringify(form.values) !== JSON.stringify(row.values) : false;
  return (
    <Sheet open={Boolean(row)} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Rows3 className="size-4 text-muted-foreground" /> {itemName} details
          </SheetTitle>
          <SheetDescription className="sr-only">View and edit this {itemName.toLowerCase()}.</SheetDescription>
        </SheetHeader>
        {row ? (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await form.submit(visible, (values) => onSave(row.id, values))) onOpenChange(false);
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex items-center gap-4 border-b px-6 py-6">
                {image ? <ImageThumb value={form.values[image.key]} size={64} className="rounded-xl text-[64px]" fallback={<Monogram text={title ? textValue(title, form.values[title.key]) : ""} />} /> : null}
                <div className="grid min-w-0 gap-2">
                  <h2 className="truncate text-lg font-semibold">{title ? textValue(title, form.values[title.key]) || "Untitled" : "Untitled"}</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {tagColumns.flatMap((column) => {
                      const value = form.values[column.key];
                      const list = Array.isArray(value) ? value : value ? [value] : [];
                      return list.map((item) => (
                        <OptionBadge key={`${column.key}-${item}`} option={column.config.options?.find((option) => option.value === item) ?? { value: String(item) }} />
                      ));
                    })}
                  </div>
                </div>
              </div>
              <Summary columns={visible} values={form.values} />
              <FormSections columns={visible} values={form.values} errors={form.errors} onChange={form.change} />
            </div>
            <SheetFooter className="flex-row items-center border-t px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-destructive hover:text-destructive"
                onClick={async () => {
                  await onDelete(row.id);
                  onOpenChange(false);
                }}
              >
                <Trash2 /> Delete
              </Button>
              {form.failure ? <p className="text-sm text-destructive">{form.failure}</p> : null}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.busy || !dirty}>
                {form.busy ? <Loader2 className="animate-spin" /> : null} Save update
              </Button>
            </SheetFooter>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Read-only highlights: percent and number columns with aggregates shown big. */
function Summary({ columns, values }: { columns: ColumnDef[]; values: RowValues }) {
  const highlights = columns.filter((column) => ["percent", "currency", "trend", "rating"].includes(column.type)).slice(0, 4);
  if (highlights.length === 0) return null;
  return (
    <section className="grid gap-3 border-b px-6 py-6 sm:grid-cols-2">
      {highlights.map((column) => (
        <div key={column.key} className="grid gap-2 rounded-lg border p-4">
          <span className="text-xs text-muted-foreground">{column.label}</span>
          <div className="text-xl font-semibold [&_.text-right]:text-left">
            <CellView column={column} value={values[column.key]} />
          </div>
        </div>
      ))}
    </section>
  );
}
