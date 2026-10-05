import React from "react";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { imageColumn, isComputed, isEmpty, optionLabel, primaryColumn, textValue, type ColumnDef, type ColumnOption } from "@/lib/columns";
import type { RowView } from "@/lib/data";
import { useTableContext } from "@/lib/table-context";
import { CellView, ImageThumb, Initials, Monogram, OptionBadge } from "../cells";

type CardProps = {
  row: RowView;
  title?: ColumnDef;
  cover?: ColumnDef;
  properties: ColumnDef[];
  onOpen: () => void;
  draggable?: boolean;
  large?: boolean;
};

function Card({ row, title, cover, properties, onOpen, draggable, large }: CardProps) {
  const { titles } = useTableContext();
  const name = title ? textValue(title, row.values[title.key], titles) : "";
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-abrum-row", row.id);
      }}
      onClick={onOpen}
      className="group grid w-full overflow-hidden rounded-lg border bg-card text-left shadow-xs transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {cover ? (
        <div className={cn("grid place-items-center overflow-hidden border-b bg-muted", large ? "h-40" : "h-28")}>
          <ImageThumb value={row.values[cover.key]} size={large ? 160 : 112} className="size-full! rounded-none border-0 text-display" fallback={<Monogram text={name} />} />
        </div>
      ) : null}
      <div className="grid gap-2 p-3">
        <span className={cn("flex items-center gap-2 font-medium", !name && "text-muted-foreground/60")}>
          {!cover ? <FileText className="size-3.5 shrink-0 text-muted-foreground" /> : null}
          <span className="truncate">{name || "Untitled"}</span>
        </span>
        {properties.map((column) =>
          isEmpty(row.values[column.key]) ? null : (
            <div key={column.key} className="flex min-w-0 items-center gap-2 text-xs">
              <span className="w-20 shrink-0 truncate text-muted-foreground">{column.label}</span>
              <span className="min-w-0 flex-1 truncate">
                <CellView column={column} value={row.values[column.key]} />
              </span>
            </div>
          ),
        )}
      </div>
    </button>
  );
}

function cardProperties(columns: ColumnDef[], cardColumns: string[] | undefined, exclude: Array<string | undefined>) {
  if (cardColumns?.length) return cardColumns.map((key) => columns.find((column) => column.key === key)).filter((column): column is ColumnDef => Boolean(column));
  return columns.filter((column) => !exclude.includes(column.key) && column.type !== "image" && column.type !== "longText").slice(0, 3);
}

export function BoardLayout({
  columns,
  allColumns,
  rows,
  groupBy,
  coverKey,
  cardColumns,
  onOpenRow,
  onMoveRow,
  onNewInGroup,
}: {
  columns: ColumnDef[];
  allColumns: ColumnDef[];
  rows: RowView[];
  groupBy?: string;
  coverKey?: string;
  cardColumns?: string[];
  onOpenRow: (id: string) => void;
  onMoveRow: (id: string, key: string, value: unknown) => Promise<unknown>;
  onNewInGroup: (key: string, value: unknown) => void;
}) {
  const { canWrite } = useTableContext();
  const group = allColumns.find((column) => column.key === groupBy) ?? allColumns.find((column) => column.type === "select") ?? allColumns.find((column) => column.type === "person");
  const [overGroup, setOverGroup] = React.useState<string | null>(null);
  if (!group) {
    return <EmptyNotice>Boards group rows by a Select, Person or Checkbox property. Add one, then choose it under “Group by”.</EmptyNotice>;
  }
  const title = primaryColumn(columns.filter((column) => column.type !== "image"));
  const cover = allColumns.find((column) => column.key === coverKey) ?? undefined;
  const properties = cardProperties(columns, cardColumns, [title?.key, group.key, cover?.key]);
  const lanes: Array<{ id: string; value: unknown; option?: ColumnOption; label: string }> =
    group.type === "checkbox"
      ? [
          { id: "true", value: true, label: "Checked" },
          { id: "false", value: false, label: "Unchecked" },
        ]
      : [...(group.config.options ?? []).map((option) => ({ id: option.value, value: option.value, option, label: optionLabel(group, option.value) })), { id: "__none", value: null, label: `No ${group.label.toLowerCase()}` }];
  const laneOf = (row: RowView) => {
    const value = row.values[group.key];
    if (group.type === "checkbox") return value === true ? "true" : "false";
    return typeof value === "string" && lanes.some((lane) => lane.id === value) ? value : "__none";
  };
  const editable = canWrite && !isComputed(group);

  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto border-t p-4 sm:px-6">
      {lanes.map((lane) => {
        const laneRows = rows.filter((row) => laneOf(row) === lane.id);
        if (lane.id === "__none" && laneRows.length === 0) return null;
        return (
          <section
            key={lane.id}
            className={cn("flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 transition-colors", overGroup === lane.id && "bg-accent")}
            onDragOver={(event) => {
              if (!editable || !event.dataTransfer.types.includes("application/x-abrum-row")) return;
              event.preventDefault();
              setOverGroup(lane.id);
            }}
            onDragLeave={() => setOverGroup(null)}
            onDrop={(event) => {
              setOverGroup(null);
              const id = event.dataTransfer.getData("application/x-abrum-row");
              if (id && editable) void onMoveRow(id, group.key, lane.value);
            }}
          >
            <header className="flex items-center gap-2 px-3 py-2.5 text-sm">
              {lane.option ? <OptionBadge option={lane.option} /> : group.type === "person" && lane.id !== "__none" ? <Initials name={lane.label} /> : <span className="font-medium">{lane.label}</span>}
              {group.type === "person" && lane.id !== "__none" ? <span className="truncate font-medium">{lane.label}</span> : null}
              <span className="text-muted-foreground tabular-nums">{laneRows.length}</span>
            </header>
            <div className="grid min-h-12 gap-2 overflow-y-auto px-2 pb-2">
              {laneRows.map((row) => (
                <Card key={row.id} row={row} title={title} cover={cover} properties={properties} draggable={editable} onOpen={() => onOpenRow(row.id)} />
              ))}
              {canWrite ? (
                <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => onNewInGroup(group.key, lane.value)}>
                  <Plus /> New
                </Button>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function GalleryLayout({
  columns,
  allColumns,
  rows,
  coverKey,
  cardColumns,
  onOpenRow,
}: {
  columns: ColumnDef[];
  allColumns: ColumnDef[];
  rows: RowView[];
  coverKey?: string;
  cardColumns?: string[];
  onOpenRow: (id: string) => void;
}) {
  const title = primaryColumn(columns.filter((column) => column.type !== "image"));
  const cover = allColumns.find((column) => column.key === coverKey) ?? imageColumn(allColumns);
  const properties = cardProperties(columns, cardColumns, [title?.key, cover?.key]);
  if (rows.length === 0) return <EmptyNotice>No rows match the search or filters.</EmptyNotice>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto border-t p-4 sm:px-6">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
        {rows.map((row) => (
          <Card key={row.id} row={row} title={title} cover={cover} properties={properties} large onOpen={() => onOpenRow(row.id)} />
        ))}
      </div>
    </div>
  );
}

export function ListLayout({ columns, rows, cardColumns, onOpenRow }: { columns: ColumnDef[]; rows: RowView[]; cardColumns?: string[]; onOpenRow: (id: string) => void }) {
  const { titles } = useTableContext();
  const title = primaryColumn(columns.filter((column) => column.type !== "image"));
  const image = imageColumn(columns);
  const properties = cardProperties(columns, cardColumns, [title?.key, image?.key]);
  if (rows.length === 0) return <EmptyNotice>No rows match the search or filters.</EmptyNotice>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto border-t">
      <ul className="divide-y">
        {rows.map((row) => {
          const name = title ? textValue(title, row.values[title.key], titles) : "";
          return (
            <li key={row.id}>
              <button type="button" onClick={() => onOpenRow(row.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 sm:px-6">
                {image ? <ImageThumb value={row.values[image.key]} size={32} className="rounded-md text-display" fallback={<Monogram text={name} />} /> : <FileText className="size-4 text-muted-foreground" />}
                <span className={cn("min-w-0 flex-1 truncate font-medium", !name && "text-muted-foreground/60")}>{name || "Untitled"}</span>
                <span className="hidden min-w-0 items-center gap-4 md:flex">
                  {properties.map((column) =>
                    isEmpty(row.values[column.key]) ? null : (
                      <span key={column.key} className="max-w-48 truncate text-sm">
                        <CellView column={column} value={row.values[column.key]} />
                      </span>
                    ),
                  )}
                </span>
                {row.body.trim() ? <FileText className="size-3.5 text-muted-foreground" aria-label="Has page content" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyNotice({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-40 flex-1 place-items-center border-t px-6 text-center text-sm text-muted-foreground">{children}</div>;
}
