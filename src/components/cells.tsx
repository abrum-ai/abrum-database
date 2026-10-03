import React from "react";
import { useAbrum } from "@abrum/react";
import { CalendarDays, Check, ImageIcon, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber, optionFor, type ColumnDef, type ColumnOption, type OptionColor } from "@/lib/columns";

const COLOR_HEX: Record<OptionColor, string> = {
  gray: "#8b8f97",
  red: "#e5484d",
  orange: "#f76b15",
  amber: "#d9a400",
  green: "#30a46c",
  teal: "#12a594",
  blue: "#0090ff",
  indigo: "#3e63dd",
  violet: "#8e4ec6",
  pink: "#d6409f",
};

export function OptionBadge({ option, className }: { option: ColumnOption; className?: string }) {
  const color = COLOR_HEX[option.color ?? "gray"];
  return (
    <span
      className={cn("inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap", className)}
      style={{
        color: `color-mix(in srgb, ${color} 78%, var(--foreground))`,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 34%, transparent)`,
      }}
    >
      {option.label ?? option.value}
    </span>
  );
}

/** Image values are `blob:<hash>` (uploaded to the Station) or https URLs. */
export function useImageUrl(value: unknown): string | null {
  const runtime = useAbrum();
  if (typeof value !== "string" || !value) return null;
  if (value.startsWith("blob:")) {
    try {
      return runtime.blobUrl(value.slice(5));
    } catch {
      return null;
    }
  }
  return /^https?:\/\//i.test(value) || value.startsWith("data:image/") ? value : null;
}

export function ImageThumb({ value, size = 28, className, fallback }: { value: unknown; size?: number; className?: string; fallback?: React.ReactNode }) {
  const url = useImageUrl(value);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [url]);
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground", className)}
      style={{ width: size, height: size }}
    >
      {url && !failed ? (
        <img src={url} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        fallback ?? <ImageIcon className="size-[45%]" />
      )}
    </span>
  );
}

export function Monogram({ text }: { text: string }) {
  const letter = text.trim()[0]?.toUpperCase();
  return letter ? <span className="text-[0.55em] font-semibold text-foreground/70">{letter}</span> : null;
}

export function Initials({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const palette = Object.values(COLOR_HEX);
  const color = palette[Math.abs(hash) % palette.length];
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full text-[10px] font-semibold"
      style={{ width: size, height: size, color, background: `color-mix(in srgb, ${color} 18%, transparent)` }}
    >
      {initials || "?"}
    </span>
  );
}

export function PersonChip({ column, value }: { column: ColumnDef; value: unknown }) {
  const option = optionFor(column, value);
  const name = option?.label ?? option?.value ?? String(value ?? "");
  if (!name) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {option?.image ? <ImageThumb value={option.image} size={22} className="rounded-full" /> : <Initials name={name} />}
      <span className="truncate">{name}</span>
    </span>
  );
}

export function Meter({ value, segments = 20, className }: { value: number; segments?: number; className?: string }) {
  const on = Math.round((Math.max(0, Math.min(100, value)) / 100) * segments);
  return (
    <span className={cn("meter", className)} aria-hidden="true">
      {Array.from({ length: segments }, (_, index) => {
        const position = index / segments;
        const level = index >= on ? undefined : position < 0.34 ? "low" : position < 0.6 ? "mid" : "high";
        return <i key={index} data-on={level} />;
      })}
    </span>
  );
}

export function Trend({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  return (
    <span className={cn("trend", className)} aria-label={values.join(", ")}>
      {values.slice(-16).map((value, index) => (
        <i key={index} style={{ height: `${Math.max(12, (value / max) * 100)}%` }} />
      ))}
    </span>
  );
}

export function Stars({ value, max = 5, onChange }: { value: number; max?: number; onChange?: (value: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }, (_, index) => {
        const filled = index < value;
        const star = <Star className={cn("size-3.5", filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />;
        return onChange ? (
          <button key={index} type="button" className="rounded p-0.5 hover:bg-accent" aria-label={`${index + 1} of ${max}`} onClick={() => onChange(index + 1 === value ? 0 : index + 1)}>
            {star}
          </button>
        ) : (
          <React.Fragment key={index}>{star}</React.Fragment>
        );
      })}
    </span>
  );
}

const MAX_TAGS = 2;

/** Read-only rendering of one stored value in a table cell. */
export function CellView({ column, value }: { column: ColumnDef; value: unknown }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  switch (column.type) {
    case "number":
    case "currency":
      return <span className="block text-right tabular-nums">{formatNumber(column, value)}</span>;
    case "percent": {
      const number = Number(value) || 0;
      return (
        <span className="flex items-center gap-3">
          <Meter value={number} className="w-28" />
          <span className="w-9 text-right tabular-nums">{number}%</span>
        </span>
      );
    }
    case "rating":
      return <Stars value={Number(value) || 0} max={column.config.max ?? 5} />;
    case "select": {
      const option = optionFor(column, value) ?? { value: String(value) };
      return <OptionBadge option={option} />;
    }
    case "multiSelect": {
      const list = Array.isArray(value) ? value : [value];
      return (
        <span className="flex items-center gap-1.5">
          {list.slice(0, MAX_TAGS).map((item) => (
            <OptionBadge key={String(item)} option={optionFor(column, item) ?? { value: String(item) }} />
          ))}
          {list.length > MAX_TAGS ? <OptionBadge option={{ value: `+${list.length - MAX_TAGS}` }} /> : null}
        </span>
      );
    }
    case "person":
      return <PersonChip column={column} value={value} />;
    case "date":
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <CalendarDays className="size-3.5 text-muted-foreground" />
          {formatDate(value)}
        </span>
      );
    case "checkbox":
      return value === true ? <Check className="size-4" /> : <span className="text-muted-foreground/50">—</span>;
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" className="truncate underline-offset-2 hover:underline" onClick={(event) => event.stopPropagation()}>
          {String(value).replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      );
    case "email":
      return (
        <a href={`mailto:${value}`} className="truncate underline-offset-2 hover:underline" onClick={(event) => event.stopPropagation()}>
          {String(value)}
        </a>
      );
    case "image":
      return <ImageThumb value={value} />;
    case "trend":
      return Array.isArray(value) ? <Trend values={value.map(Number)} /> : null;
    case "longText":
      return <span className="block max-w-72 truncate text-muted-foreground">{String(value)}</span>;
    default:
      return <span className="truncate">{String(value)}</span>;
  }
}
