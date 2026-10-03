import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AGGREGATE_LABELS,
  COLUMN_TYPES,
  OPTION_COLORS,
  TYPE_LABELS,
  type Aggregate,
  type ColumnConfig,
  type ColumnDef,
  type ColumnOption,
  type ColumnType,
} from "@/lib/columns";
import { OptionBadge } from "./cells";

const NONE = "__none__";
const OPTION_TYPES: ColumnType[] = ["select", "multiSelect", "person"];
const NUMERIC_TYPES: ColumnType[] = ["number", "currency", "percent", "rating"];

export type ColumnDraft = { label: string; type: ColumnType; config: ColumnConfig; required: boolean };

export function ColumnDialog({
  open,
  onOpenChange,
  column,
  sections,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  column: ColumnDef | null;
  sections: string[];
  onSubmit: (draft: ColumnDraft) => Promise<unknown>;
}) {
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) return setFailure("Give the column a name.");
    const next: ColumnConfig = { ...config };
    if (OPTION_TYPES.includes(type)) next.options = parsedOptions;
    else delete next.options;
    if (type !== "currency") delete next.currency;
    if (!NUMERIC_TYPES.includes(type)) delete next.aggregate;
    for (const key of Object.keys(next) as Array<keyof ColumnConfig>) if (next[key] === undefined || next[key] === "") delete next[key];
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit({ label: label.trim(), type, config: next, required });
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
            <DialogTitle>{column ? "Edit column" : "Add column"}</DialogTitle>
            <DialogDescription>Columns define the fields of every item. Agents can change them too.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="column-label">Name</Label>
              <Input id="column-label" autoFocus value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Stage" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="column-type">Type</Label>
              <Select value={type} onValueChange={(next) => setType(next as ColumnType)}>
                <SelectTrigger id="column-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMN_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {TYPE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {OPTION_TYPES.includes(type) ? (
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
            {type === "currency" ? (
              <div className="grid gap-2">
                <Label htmlFor="column-currency">Currency</Label>
                <Input id="column-currency" maxLength={3} value={config.currency ?? "EUR"} onChange={(event) => set({ currency: event.target.value.toUpperCase() })} />
              </div>
            ) : null}
            {type === "number" || type === "currency" ? (
              <div className="grid gap-2">
                <Label htmlFor="column-decimals">Decimals</Label>
                <Input
                  id="column-decimals"
                  type="number"
                  min={0}
                  max={6}
                  disabled={Boolean(column)}
                  value={config.decimals ?? (type === "currency" ? 2 : 0)}
                  onChange={(event) => set({ decimals: Math.max(0, Math.min(6, Math.trunc(Number(event.target.value)) || 0)) })}
                />
              </div>
            ) : null}
            {NUMERIC_TYPES.includes(type) ? (
              <div className="grid gap-2">
                <Label htmlFor="column-aggregate">Footer calculation</Label>
                <Select value={config.aggregate ?? NONE} onValueChange={(next) => set({ aggregate: next === NONE ? undefined : (next as Aggregate) })}>
                  <SelectTrigger id="column-aggregate" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {(Object.keys(AGGREGATE_LABELS) as Aggregate[]).map((item) => (
                      <SelectItem key={item} value={item}>
                        {AGGREGATE_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
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
          </div>
          {column && column.type !== type ? <p className="text-xs text-muted-foreground">Existing values that don’t fit the new type are shown as empty. Ask the agent to convert them.</p> : null}
          <DialogFooter className="items-center">
            {failure ? <p className="mr-auto text-sm text-destructive">{failure}</p> : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} {column ? "Save column" : "Add column"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
