import React from "react";
import { Copy, Loader2, Plus, Rows3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { imageColumn, isComputed, primaryColumn, textValue, validateValues, type ColumnDef, type RowValues } from "@/lib/columns";
import type { RowView } from "@/lib/data";
import { useTableContext } from "@/lib/table-context";
import { ImageThumb, Monogram, OptionBadge } from "./cells";
import { Field, FieldInput } from "./field-input";
import { PageBody } from "./markdown";

/** Columns grouped by `config.section`, keeping column order. */
function sections(columns: ColumnDef[]) {
  const groups: Array<{ title: string | null; columns: ColumnDef[] }> = [];
  for (const column of columns) {
    const title = column.config.section ?? null;
    const existing = groups.find((group) => group.title === title);
    if (existing) existing.columns.push(column);
    else groups.push({ title, columns: [column] });
  }
  return groups;
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

/** Only stored (editable) values; computed columns never reach a twin. */
function storedOnly(columns: ColumnDef[], values: RowValues): RowValues {
  const out: RowValues = {};
  for (const column of columns) if (!isComputed(column) && values[column.key] !== undefined) out[column.key] = values[column.key];
  return out;
}

export function NewItemDialog({
  open,
  onOpenChange,
  columns,
  itemName,
  tableName,
  defaults,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnDef[];
  itemName: string;
  tableName: string;
  defaults?: RowValues;
  onCreate: (values: RowValues) => Promise<unknown>;
}) {
  const form = useFormState({});
  React.useEffect(() => {
    if (open) form.reset(defaults ?? {});
  }, [open, defaults, form.reset]);
  const editable = columns.filter((column) => !isComputed(column));
  const primary = primaryColumn(editable.filter((column) => column.type !== "image"));
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
            if (await form.submit(editable, (values) => onCreate(storedOnly(editable, values)))) onOpenChange(false);
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sections(editable).map((group, index) => (
              <section key={group.title ?? `section-${index}`} className="grid gap-5 border-b px-6 py-6 last:border-b-0">
                {group.title ? <h3 className="text-xs font-medium tracking-label text-muted-foreground uppercase">{group.title}</h3> : null}
                <div className="grid gap-5 sm:grid-cols-2">
                  {group.columns.map((column) => (
                    <Field
                      key={column.key}
                      column={column}
                      wide={column.key === primary?.key}
                      value={form.values[column.key]}
                      error={form.errors[column.key]}
                      onChange={(value) => form.change(column.key, value)}
                    />
                  ))}
                </div>
              </section>
            ))}
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

/** The page of one row: title, properties, Markdown content. */
export function RowSheet({
  row,
  columns,
  itemName,
  onOpenChange,
  onSave,
  onDelete,
  onDuplicate,
}: {
  row: RowView | null;
  columns: ColumnDef[];
  itemName: string;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: { values: RowValues; body: string }) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onDuplicate: (id: string) => Promise<unknown>;
}) {
  const { canWrite, titles } = useTableContext();
  const form = useFormState(row?.stored ?? {});
  const [body, setBody] = React.useState(row?.body ?? "");
  const rowId = row?.id;
  React.useEffect(() => {
    if (row) {
      form.reset(row.stored);
      setBody(row.body);
    }
    // Reset only when another row is opened, not on every live update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId]);
  const editable = columns.filter((column) => !isComputed(column));
  const title = primaryColumn(editable.filter((column) => column.type !== "image"));
  const image = imageColumn(editable);
  const tagColumns = columns.filter((column) => column.type === "select" || column.type === "multiSelect");
  const properties = columns.filter((column) => column.key !== title?.key && column.key !== image?.key);
  const dirty = row ? JSON.stringify(storedOnly(editable, form.values)) !== JSON.stringify(storedOnly(editable, row.stored)) || body !== row.body : false;

  async function save() {
    if (!row) return false;
    return form.submit(editable, (values) => onSave(row.id, { values: storedOnly(editable, values), body }));
  }

  function close() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onOpenChange(false);
  }

  return (
    <Sheet open={Boolean(row)} onOpenChange={(open) => (open ? onOpenChange(true) : close())}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
        onKeyDown={async (event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            if (canWrite && dirty && (await save())) onOpenChange(false);
          }
        }}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Rows3 className="size-4 text-muted-foreground" /> {itemName}
          </SheetTitle>
          <SheetDescription className="sr-only">View and edit this {itemName.toLowerCase()}.</SheetDescription>
        </SheetHeader>
        {row ? (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await save()) onOpenChange(false);
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex items-start gap-4 px-6 pt-6 pb-4">
                {image ? (
                  <ImageThumb
                    value={form.values[image.key]}
                    size={64}
                    className="rounded-xl text-display"
                    fallback={<Monogram text={title ? textValue(title, form.values[title.key], titles) : ""} />}
                  />
                ) : null}
                <div className="grid min-w-0 flex-1 gap-2">
                  {title ? (
                    <input
                      value={String(form.values[title.key] ?? "")}
                      onChange={(event) => form.change(title.key, event.target.value)}
                      readOnly={!canWrite}
                      placeholder="Untitled"
                      aria-label={title.label}
                      className={cn("w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/60", form.errors[title.key] && "text-destructive")}
                    />
                  ) : null}
                  {form.errors[title?.key ?? ""] ? <p className="text-xs text-destructive">{form.errors[title!.key]}</p> : null}
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
              <div className="grid gap-1 border-b px-6 pb-6">
                {image ? <PropertyRow column={image} value={form.values[image.key]} error={form.errors[image.key]} onChange={(value) => form.change(image.key, value)} /> : null}
                {properties.map((column) => (
                  <PropertyRow
                    key={column.key}
                    column={column}
                    value={isComputed(column) ? row.values[column.key] : form.values[column.key]}
                    error={form.errors[column.key]}
                    onChange={(value) => form.change(column.key, value)}
                  />
                ))}
              </div>
              <section className="grid gap-2 px-6 py-6">
                <h3 className="text-xs font-medium tracking-label text-muted-foreground uppercase">Page</h3>
                <PageBody value={body} onChange={setBody} readOnly={!canWrite} />
              </section>
            </div>
            {canWrite ? (
              <SheetFooter className="flex-row items-center border-t px-6 py-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={async () => {
                    if (!window.confirm(`Delete this ${itemName.toLowerCase()}?`)) return;
                    await onDelete(row.id);
                    onOpenChange(false);
                  }}
                >
                  <Trash2 /> Delete
                </Button>
                <Button type="button" variant="ghost" onClick={() => void onDuplicate(row.id)}>
                  <Copy /> Duplicate
                </Button>
                <span className="mr-auto" />
                {form.failure ? <p className="text-sm text-destructive">{form.failure}</p> : null}
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.busy || !dirty}>
                  {form.busy ? <Loader2 className="animate-spin" /> : null} Save update
                </Button>
              </SheetFooter>
            ) : null}
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PropertyRow({ column, value, error, onChange }: { column: ColumnDef; value: unknown; error?: string; onChange: (value: unknown) => void }) {
  const { canWrite } = useTableContext();
  return (
    <div className="grid items-start gap-1 py-1.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <label htmlFor={`field-${column.key}`} className="truncate pt-2 text-sm text-muted-foreground" title={column.label}>
        {column.label}
        {column.required ? " *" : ""}
      </label>
      <div className="grid min-w-0 gap-1">
        <fieldset disabled={!canWrite} className="min-w-0">
          <FieldInput column={column} value={value} onChange={onChange} invalid={Boolean(error)} />
        </fieldset>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
