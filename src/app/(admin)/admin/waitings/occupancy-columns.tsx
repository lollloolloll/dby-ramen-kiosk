"use client";

import { ColumnDef } from "@tanstack/react-table";
import type { OccupancyRow } from "@/lib/actions/rental";

export type { OccupancyRow };

// 관제탑: 시간제 아이템별 점유 n/N · 잔여 · 대기 · 다음 반납예정.
// 점유 단위는 "대여 1건 = 1"(인원수 무관).
export const occupancyColumns: ColumnDef<OccupancyRow>[] = [
  { accessorKey: "itemName", header: "아이템" },
  {
    id: "occupancy",
    header: "점유",
    cell: ({ row }) => `${row.original.occupied}/${row.original.quantity}`,
  },
  { accessorKey: "remaining", header: "잔여" },
  { accessorKey: "waitCount", header: "대기" },
  {
    id: "nextDue",
    header: "다음 반납예정",
    cell: ({ row }) =>
      row.original.nextDueDate
        ? new Date(row.original.nextDueDate * 1000).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "-",
  },
];
