import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formulaReferences, parseFormula } from "../../shared/compute.js";
import {
  COLUMN_TYPES,
  FORMULA_FORMATS,
  OPTION_COLORS,
  OPTION_TYPES,
  ROLLUP_FUNCTIONS,
  ROLLUP_LABELS,
  TYPE_LABELS,
  isComputed,
  type ColumnConfig,
  type ColumnDef,
  type ColumnOption,
  type ColumnType,
  type FormulaFormat,
  type RollupFunction,
} from "@/lib/columns";
import { useTableContext } from "@/lib/table-context";
import { OptionBadge } from "./cells";

const TYPE_GROUPS: Array<{ label: string; types: ColumnType[] }> = [
  { label: "Basic", types: ["text", "longText", "number", "currency", "percent", "rating", "date", "checkbox"] },
  { label: "Choice", types: ["select", "multiSelect", "person"] },
  { label: "Contact & media", types: ["url", "email", "phone", "image", "trend"] },
  { label: "Advanced", types: ["relation", "rollup", "formula", "createdTime", "editedTime"] },
];

export type ColumnDraft = { label: string; type: ColumnType; config: ColumnConfig; required: boolean };

export function ColumnDialog({
  open,
  onOpenChange,
  column,
  tableKey,
  columns,
  tables,
  sections,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  column: ColumnDef | null;
  tableKey: string;
  columns: ColumnDef[];
  tables: Array<{ key: string; name: string }>;
  sections: string[];
  onSubmit: (draft: ColumnDraft) => Promise<unknown>;
}) {
  const { columnsFor } = useTableContext();
  const [label, setLabel] = React.useState("");
  const [type, setType] = React.useState<ColumnType>("text");
  const [options, setOptions] = React.useState("");
  const [config, setConfig] = React.useState<ColumnConfig>({});
  const [required, setRequired] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLabel(column?.label ?? "");
    setType(column?.type ?? "text");
    setOptions((column?.config.options ?? []).map((option) => option.label ?? option.value).join(", "));
    setConfig(column?.config ?? {});
    setRequired(column?.required ?? false);
    setFailure(null);
  }, [open, column]);

  const parsedOptions: ColumnOption[] = React.useMemo(() => {
    const previous = column?.config.options ?? [];
    return options
      .split(",")
      .map((item) => item.trim())
      .filter((item, index, list) => item && list.indexOf(item) === index)
      .map((item, index) => {
        const existing = previous.find((option) => (option.label ?? option.value) === item);
        return existing ?? { value: item, color: OPTION_COLORS[(index + 4) % OPTION_COLORS.length] };
      });
  }, [options, column]);

  const set = (patch: Partial<ColumnConfig>) => setConfig((current) => ({ ...current, ...patch }));
  const others = columns.filter((item) => item.key !== column?.key);
  const relations = others.filter((item) => item.type === "relation");
  const rollupRelation = relations.find((item) => item.key === config.relation);
  const rollupTargets = rollupRelation ? columnsFor(rollupRelation.config.tableKey ?? "") : [];

  const formulaCheck = React.useMemo(() => {
    if (type !== "formula") return null;
    if (!config.expression?.trim()) return { error: "Write an expression, e.g. prop(\"Price\") * prop(\"Quantity\")" };
    try {
      const references = [...formulaReferences(parseFormula(config.expression))];
      const unknown = references.filter((name) => !others.some((item) => item.key === name || item.label.toLowerCase() === name.toLowerCase()));
      return unknown.length ? { error: `Unknown column ${unknown.map((name) => `“${name}”`).join(", ")}` } : { ok: references };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [type, config.expression, others]);

  const typeLocked = Boolean(column) && (isComputed(column!) || column!.type === "relation");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) return setFailure("Give the column a name.");
    if (type === "relation" && !config.tableKey) return setFailure("Choose the table to link to.");
    if (type === "rollup" && (!config.relation || ((config.fn ?? "count") !== "count" && !config.property))) return setFailure("Choose a relation and a property to roll up.");
    if (formulaCheck?.error) return setFailure(formulaCheck.error);
    const next: ColumnConfig = { ...config };
    if (OPTION_TYPES.has(type)) next.options = parsedOptions;
    else delete next.options;
    if (type !== "currency" && !(type === "formula" && next.format === "currency")) delete next.currency;
    if (type !== "relation") {
      delete next.tableKey;
      delete next.single;
    }
    if (type !== "rollup") {
      delete next.relation;
      delete next.property;
      delete next.fn;
    } else next.fn = next.fn ?? "count";
    if (type !== "formula") {
      delete next.expression;
      delete next.format;
    }
    for (const key of Object.keys(next) as Array<keyof ColumnConfig>) if (next[key] === undefined || next[key] === "") delete next[key];
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit({ label: label.trim(), type, config: next, required: isComputed({ type } as ColumnDef) ? false : required });
      onOpenChange(false);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{column ? "Edit property" : "Add property"}</DialogTitle>
            <DialogDescription>Properties define the fields of every item. Agents can change them too.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="column-label">Name</Label>
              <Input id="column-label" autoFocus value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Stage" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="column-type">Type</Label>
              <Select value={type} onValueChange={(next) => setType(next as ColumnType)} disabled={typeLocked}>
                <SelectTrigger id="column-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.types
                        .filter((item) => !column || typeLocked || !(isComputed({ type: item } as ColumnDef) || item === "relation"))
                        .map((item) => (
                          <SelectItem key={item} value={item}>
                            {TYPE_LABELS[item]}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {OPTION_TYPES.has(type) ? (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="column-options">{type === "person" ? "People" : "Options"} (comma separated)</Label>
                <Input id="column-options" value={options} onChange={(event) => setOptions(event.target.value)} placeholder="Enterprise, Mid-Market, SMB" />
                {type !== "person" && parsedOptions.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {parsedOptions.map((option) => (
                      <OptionBadge key={option.value} option={option} />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {type === "relation" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="column-target">Related table</Label>
                  <Select value={config.tableKey ?? ""} onValueChange={(tableKeyValue) => set({ tableKey: tableKeyValue })} disabled={Boolean(column)}>
                    <SelectTrigger id="column-target" className="w-full">
                      <SelectValue placeholder="Choose a table" />
                    </SelectTrigger>
                    <SelectContent>
                      {tables.map((table) => (
                        <SelectItem key={table.key} value={table.key}>
                          {table.name}
                          {table.key === tableKey ? " (this table)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <Checkbox checked={config.single === true} onCheckedChange={(checked) => set({ single: checked === true || undefined })} /> Link one row only
                </label>
              </>
            ) : null}

            {type === "rollup" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="column-rollup-relation">Relation</Label>
                  <Select value={config.relation ?? ""} onValueChange={(relation) => set({ relation, property: undefined })}>
                    <SelectTrigger id="column-rollup-relation" className="w-full">
                      <SelectValue placeholder={relations.length ? "Choose a relation" : "Add a relation first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {relations.map((relation) => (
                        <SelectItem key={relation.key} value={relation.key}>
                          {relation.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="column-rollup-fn">Calculate</Label>
                  <Select value={config.fn ?? "count"} onValueChange={(fn) => set({ fn: fn as RollupFunction })}>
                    <SelectTrigger id="column-rollup-fn" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLLUP_FUNCTIONS.map((fn) => (
                        <SelectItem key={fn} value={fn}>
                          {ROLLUP_LABELS[fn]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(config.fn ?? "count") !== "count" ? (
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="column-rollup-property">Property of the related rows</Label>
                    <Select value={config.property ?? ""} onValueChange={(property) => set({ property })} disabled={!rollupRelation}>
                      <SelectTrigger id="column-rollup-property" className="w-full">
                        <SelectValue placeholder="Choose a property" />
                      </SelectTrigger>
                      <SelectContent>
                        {rollupTargets.map((target) => (
                          <SelectItem key={target.key} value={target.key}>
                            {target.label} · {TYPE_LABELS[target.type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </>
            ) : null}

            {type === "formula" ? (
              <>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="column-expression">Formula</Label>
                  <Textarea
                    id="column-expression"
                    rows={3}
                    className="font-mono text-sm"
                    value={config.expression ?? ""}
                    onChange={(event) => set({ expression: event.target.value })}
                    placeholder={'prop("Price") * prop("Quantity")\nif(prop("Due") < today(), "Late", "On time")'}
                    spellCheck={false}
                  />
                  <p className={formulaCheck?.error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {formulaCheck?.error ?? `Uses ${formulaCheck?.ok?.length ? formulaCheck.ok.join(", ") : "no columns"}. Functions: if, ifs, round, sum, concat, dateBetween, dateAdd, formatDate, today, …`}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="column-format">Show as</Label>
                  <Select value={config.format ?? "auto"} onValueChange={(format) => set({ format: format === "auto" ? undefined : (format as FormulaFormat) })}>
                    <SelectTrigger id="column-format" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automatic</SelectItem>
                      {FORMULA_FORMATS.map((format) => (
                        <SelectItem key={format} value={format}>
                          {format[0].toUpperCase() + format.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}

            {type === "currency" || (type === "formula" && config.format === "currency") ? (
              <div className="grid gap-2">
                <Label htmlFor="column-currency">Currency</Label>
                <Input id="column-currency" maxLength={3} value={config.currency ?? "EUR"} onChange={(event) => set({ currency: event.target.value.toUpperCase() })} />
              </div>
            ) : null}
            {type === "number" || type === "currency" || type === "formula" ? (
              <div className="grid gap-2">
                <Label htmlFor="column-decimals">Decimals</Label>
                <Input
                  id="column-decimals"
                  type="number"
                  min={0}
                  max={6}
                  disabled={Boolean(column) && (type === "number" || type === "currency")}
                  value={config.decimals ?? (type === "currency" ? 2 : type === "formula" ? "" : 0)}
                  onChange={(event) => set({ decimals: event.target.value === "" ? undefined : Math.max(0, Math.min(6, Math.trunc(Number(event.target.value)) || 0)) })}
                />
              </div>
            ) : null}
            {type === "rating" ? (
              <div className="grid gap-2">
                <Label htmlFor="column-max">Maximum</Label>
                <Input id="column-max" type="number" min={1} max={10} value={config.max ?? 5} onChange={(event) => set({ max: Math.max(1, Math.min(10, Math.trunc(Number(event.target.value)) || 5)) })} />
              </div>
            ) : null}

            {!isComputed({ type } as ColumnDef) ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="column-section">Form section</Label>
                  <Input id="column-section" list="column-sections" value={config.section ?? ""} onChange={(event) => set({ section: event.target.value || undefined })} placeholder="Optional" />
                  <datalist id="column-sections">
                    {sections.map((section) => (
                      <option key={section} value={section} />
                    ))}
                  </datalist>
                </div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <Checkbox checked={required} onCheckedChange={(checked) => setRequired(checked === true)} /> Required
                </label>
              </>
            ) : null}
          </div>
          {column && column.type !== type ? <p className="text-xs text-muted-foreground">Existing values are converted to the new type where possible.</p> : null}
          <DialogFooter className="items-center">
            {failure ? <p className="mr-auto text-sm text-destructive">{failure}</p> : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} {column ? "Save property" : "Add property"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
