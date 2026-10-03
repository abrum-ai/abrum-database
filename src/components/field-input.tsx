import React from "react";
import { useAbrum } from "@abrum/react";
import { Building2, Check, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toDisplayNumber, toStoredNumber, type ColumnDef } from "@/lib/columns";
import { ImageThumb, Initials, Meter, OptionBadge, Stars } from "./cells";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const NONE = "__none__";

type FieldProps = { column: ColumnDef; value: unknown; onChange: (value: unknown) => void; invalid?: boolean };

/** Editable control for one column. Values are always the stored form. */
export function FieldInput({ column, value, onChange, invalid }: FieldProps) {
  const id = `field-${column.key}`;
  const common = { id, "aria-invalid": invalid || undefined, placeholder: column.config.placeholder };
  switch (column.type) {
    case "longText":
      return <Textarea {...common} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} rows={3} />;
    case "number":
    case "currency":
      return <NumberField column={column} value={value} onChange={onChange} invalid={invalid} />;
    case "percent": {
      const number = typeof value === "number" ? value : 0;
      return (
        <div className="grid gap-3">
          <Slider id={id} value={[number]} min={0} max={100} step={1} onValueChange={([next]) => onChange(next)} />
          <Meter value={number} segments={40} />
        </div>
      );
    }
    case "rating":
      return <Stars value={typeof value === "number" ? value : 0} max={column.config.max ?? 5} onChange={onChange} />;
    case "select":
    case "person":
      return (
        <Select value={typeof value === "string" && value ? value : NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
          <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>
              <span className="text-muted-foreground">None</span>
            </SelectItem>
            {(column.config.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {column.type === "person" ? (
                  <span className="flex items-center gap-2">
                    {option.image ? <ImageThumb value={option.image} size={20} className="rounded-full" /> : <Initials name={option.label ?? option.value} size={20} />}
                    {option.label ?? option.value}
                  </span>
                ) : (
                  option.label ?? option.value
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multiSelect":
      return <MultiSelectField column={column} value={value} onChange={onChange} invalid={invalid} />;
    case "date":
      return <Input {...common} type="date" value={typeof value === "string" ? value.slice(0, 10) : ""} onChange={(event) => onChange(event.target.value || null)} />;
    case "checkbox":
      return (
        <label className="flex h-9 items-center gap-2 text-sm">
          <Checkbox id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
          {column.config.description ?? "Yes"}
        </label>
      );
    case "url":
      return <Input {...common} type="url" inputMode="url" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} placeholder={column.config.placeholder ?? "https://"} />;
    case "email":
      return <Input {...common} type="email" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} placeholder={column.config.placeholder ?? "name@example.com"} />;
    case "phone":
      return <Input {...common} type="tel" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />;
    case "image":
      return <ImageField column={column} value={value} onChange={onChange} />;
    case "trend":
      return (
        <Input
          {...common}
          value={Array.isArray(value) ? value.join(", ") : ""}
          placeholder="e.g. 2, 5, 3, 8"
          onChange={(event) => {
            const list = event.target.value.split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite).map(Math.round);
            onChange(list);
          }}
        />
      );
    default:
      return <Input {...common} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />;
  }
}

function NumberField({ column, value, onChange, invalid }: FieldProps) {
  const display = toDisplayNumber(column, value);
  const [draft, setDraft] = React.useState(display === null ? "" : String(display));
  React.useEffect(() => {
    const current = draft.trim() === "" ? null : Number(draft.replace(",", "."));
    if (current !== display) setDraft(display === null ? "" : String(display));
    // Only resync when the stored value changes from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display]);
  const prefix = column.type === "currency" ? currencySymbol(column.config.currency) : null;
  return (
    <div className="relative">
      {prefix ? <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted-foreground">{prefix}</span> : null}
      <Input
        id={`field-${column.key}`}
        aria-invalid={invalid || undefined}
        inputMode="decimal"
        className={cn(prefix && "pl-8")}
        placeholder={column.config.placeholder}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const raw = event.target.value.replace(/\s/g, "").replace(",", ".");
          if (raw === "") return onChange(null);
          const number = Number(raw);
          if (Number.isFinite(number)) onChange(toStoredNumber(column, number));
        }}
      />
    </div>
  );
}

function currencySymbol(code = "EUR") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).formatToParts(0).find((part) => part.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

function MultiSelectField({ column, value, onChange, invalid }: FieldProps) {
  const selected = Array.isArray(value) ? value.map(String) : [];
  const options = column.config.options ?? [];
  const toggle = (item: string) => onChange(selected.includes(item) ? selected.filter((entry) => entry !== item) : [...selected, item]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={`field-${column.key}`}
          aria-invalid={invalid || undefined}
          className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 text-left text-sm shadow-xs aria-invalid:border-destructive"
        >
          {selected.length === 0 ? <span className="px-1 text-muted-foreground">Choose…</span> : null}
          {selected.map((item) => (
            <OptionBadge key={item} option={options.find((option) => option.value === item) ?? { value: item }} />
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        {options.length === 0 ? <p className="p-2 text-sm text-muted-foreground">No options defined yet.</p> : null}
        {options.map((option) => (
          <button key={option.value} type="button" className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent" onClick={() => toggle(option.value)}>
            <span className="grid size-4 place-items-center">{selected.includes(option.value) ? <Check className="size-4" /> : null}</span>
            <OptionBadge option={option} />
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ImageField({ column, value, onChange }: FieldProps) {
  const runtime = useAbrum();
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Choose a PNG, JPG, WebP, GIF or SVG image.");
    if (file.size > MAX_IMAGE_BYTES) return setError("Images can be up to 5 MB.");
    setBusy(true);
    try {
      const { hash } = await runtime.uploadBlob(file);
      onChange(`blob:${hash}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn("flex items-center gap-4 rounded-lg", dragging && "outline-2 outline-offset-4 outline-ring outline-dashed")}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void upload(event.dataTransfer.files[0]);
      }}
    >
      <ImageThumb value={value} size={64} className="rounded-xl" fallback={busy ? <Loader2 className="size-5 animate-spin" /> : <Building2 className="size-6" />} />
      <div className="grid gap-1.5">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <Upload /> {value ? "Replace" : `Upload ${column.label.toLowerCase()}`}
          </Button>
          {value ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X /> Remove
            </Button>
          ) : null}
        </div>
        <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error ?? "PNG, JPG, WebP or SVG up to 5 MB. You can also drop a file here."}</p>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(event) => void upload(event.target.files?.[0] ?? undefined)} />
    </div>
  );
}

/** Label + control + error, used by the modal and the details sheet. */
export function Field({ column, value, onChange, error, wide }: FieldProps & { error?: string; wide?: boolean }) {
  const percent = column.type === "percent";
  return (
    <div className={cn("grid gap-2", (wide || wideType(column)) && "sm:col-span-2")}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={`field-${column.key}`}>
          {column.label}
          {column.required ? <span className="text-muted-foreground">*</span> : null}
        </Label>
        {percent ? <span className="text-sm tabular-nums">{typeof value === "number" ? value : 0}%</span> : null}
      </div>
      <FieldInput column={column} value={value} onChange={onChange} invalid={Boolean(error)} />
      {error ? <p className="text-xs text-destructive">{error}</p> : column.config.description && column.type !== "checkbox" ? <p className="text-xs text-muted-foreground">{column.config.description}</p> : null}
    </div>
  );
}

export function wideType(column: ColumnDef) {
  return ["longText", "image", "percent", "multiSelect"].includes(column.type);
}
