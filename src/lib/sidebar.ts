import type { AbrumSidebarNavigationItem } from "@abrum/react";
import type { TableInfo } from "./data";

export function tableNavigationId(roomId: string, table: TableInfo): string {
  const record = table.record as { $?: { lineageCid?: string; cid?: string } };
  return `table:${roomId}:${record.$?.lineageCid ?? record.$?.cid ?? table.key}`;
}

export function databaseSidebarItems(roomId: string | null, tables: TableInfo[], canWrite: boolean): AbrumSidebarNavigationItem[] {
  if (!roomId) return [];
  const root = `database:${roomId}`;
  return [
    { id: root, roomId, label: "Database", kind: "group", icon: "database", disabled: !canWrite },
    ...tables.map(table => ({
      id: tableNavigationId(roomId, table), roomId, parentId: root,
      label: table.name, kind: "item" as const, icon: "database",
      ...(canWrite ? { actions: [
        { id: "table.rename", label: "Rename", icon: "pencil" },
        { id: "table.delete", label: "Delete", icon: "trash", destructive: true },
      ] } : {}),
    })),
  ];
}
