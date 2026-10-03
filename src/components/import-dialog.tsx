import React from "react";
import { FileUp, Loader2 } from "lucide-react";
import { useAbrumActions } from "@abrum/react";
import { app } from "@abrum/generated";
import type { JsonValue } from "@abrum/web-runtime";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TYPE_LABELS, isComputed, parseCsv, type ColumnDef } from "@/lib/columns";

const SKIP = "__skip";
const NEW = "__new";
const BODY = "__body";
const BATCH = 500;

/** Normalize common CSV spellings into the units the tools accept. */
function importValue(column: ColumnDef, raw: string): unknown {
  const value = raw.trim();
  if (!value) return null;
  switch (column.type) {
    case "number":
    case "currency":
    case "percent":
    case "rating": {
      let text = value.replace(/[^\d,.\-+]/g, "");
      // 1.234,56 → 1234.56 ; 1,234.56 → 1234.56 ; 12,5 → 12.5
      if (/,\d{1,2}$/.test(text) && text.includes(".")) text = text.replace(/\./g, "").replace(",", ".");
      else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, "");
      else text = text.replace(",", ".");
      const number = Number(text);
      return Number.isFinite(number) ? number : null;
    }
    case "date": {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
      const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(value);
      if (dotted) return `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
    }
    case "checkbox":
      return /^(true|yes|ja|x|1|✓|checked)$/i.test(value);
    case "multiSelect":
    case "relation":
      return value.split(/[,;]\s*/).filter(Boolean);
    case "trend":
      return value.split(/[\s,;]+/).map(Number).filter(Number.isFinite);
    case "image":
      return /^https:\/\//i.test(value) ? value : null;
    default:
      return value;
  }
}

export function ImportDialog({
  open,
  onOpenChange,
  tableKey,
  tableName,
  columns,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableKey: string;
  tableName: string;
  columns: ColumnDef[];
}) {
  const actions = useAbrumActions(app);
  const input = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState("");
  const [rows, setRows] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<string[]>([]);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const editable = columns.filter((column) => !isComputed(column));
  const header = rows[0] ?? [];
  const body = rows.slice(1);

  React.useEffect(() => {
    if (!open) {
      setRows([]);
      setFileName("");
      setMapping([]);
      setProgress(null);
      setFailure(null);
    }
  }, [open]);

  async function load(file: File | undefined) {
    if (!file) return;
    setFailure(null);
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) return setFailure("The file needs a header row and at least one data row.");
    setFileName(file.name);
    setRows(parsed);
    setMapping(
      parsed[0].map((name) => {
        const wanted = name.trim().toLowerCase();
        if (["page", "content", "body", "notes"].includes(wanted) && !editable.some((column) => column.label.toLowerCase() === wanted)) return BODY;
        return editable.find((column) => column.label.toLowerCase() === wanted || column.key.toLowerCase() === wanted)?.key ?? NEW;
      }),
    );
  }

  async function runImport() {
    setFailure(null);
    try {
      const keys = [...mapping];
      const known = new Map(editable.map((column) => [column.key, column]));
      for (const [index, target] of mapping.entries()) {
        if (target !== NEW || !header[index]?.trim()) continue;
        setProgress(`Adding property “${header[index]}”…`);
        const result = (await actions.addColumn({ table: tableKey, label: header[index].trim(), type: "text" })) as { data?: { column?: { key: string } } };
        const key = result?.data?.column?.key;
        if (!key) throw new Error(`Could not add the property “${header[index]}”`);
        keys[index] = key;
        known.set(key, { key, label: header[index].trim(), type: "text", config: {}, required: false, order: 0 });
      }
      let done = 0;
      for (let start = 0; start < body.length; start += BATCH) {
        const chunk = body.slice(start, start + BATCH).map((cells) => {
          const values: Record<string, unknown> = {};
          let pageBody = "";
          keys.forEach((key, index) => {
            if (key === SKIP || key === NEW) return;
            if (key === BODY) {
              pageBody = cells[index] ?? "";
              return;
            }
            const column = known.get(key);
            if (!column) return;
            const value = importValue(column, cells[index] ?? "");
            if (value !== null) values[key] = value;
          });
          return pageBody ? { values, body: pageBody } : values;
        });
        setProgress(`Importing rows ${start + 1}–${Math.min(body.length, start + BATCH)} of ${body.length}…`);
        await actions.addRows({ table: tableKey, rows: chunk as JsonValue });
        done += chunk.length;
      }
      setProgress(`Imported ${done} rows.`);
      onOpenChange(false);
    } catch (cause) {
      setProgress(null);
      setFailure(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const busy = Boolean(progress) && !failure;
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import CSV into {tableName}</DialogTitle>
          <DialogDescription>Rows are added to this table. Match each CSV column to a property, create a new one, or skip it.</DialogDescription>
        </DialogHeader>
        {rows.length === 0 ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void load(event.dataTransfer.files[0]);
            }}
            className="grid h-40 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-accent"
          >
            <span className="grid justify-items-center gap-2">
              <FileUp className="size-6" /> Choose a .csv file or drop it here
            </span>
          </button>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-3 text-sm text-muted-foreground">
              {fileName} · {body.length} rows
            </p>
            <div className="grid gap-2">
              {header.map((name, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{name || `Column ${index + 1}`}</p>
                    <p className="truncate text-xs text-muted-foreground">{body.slice(0, 3).map((row) => row[index]).filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <Select value={mapping[index]} onValueChange={(value) => setMapping((current) => current.map((item, position) => (position === index ? value : item)))}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEW}>New text property</SelectItem>
                      <SelectItem value={BODY}>Page content</SelectItem>
                      <SelectItem value={SKIP}>Skip</SelectItem>
                      {editable.map((column) => (
                        <SelectItem key={column.key} value={column.key}>
                          {column.label} · {TYPE_LABELS[column.type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(event) => void load(event.target.files?.[0] ?? undefined)} />
        <DialogFooter className="items-center">
          {failure ? <p className="mr-auto text-sm text-destructive">{failure}</p> : progress ? <p className="mr-auto text-sm text-muted-foreground">{progress}</p> : null}
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || body.length === 0} onClick={() => void runImport()}>
            {busy ? <Loader2 className="animate-spin" /> : <FileUp />} Import {body.length ? `${body.length} rows` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
