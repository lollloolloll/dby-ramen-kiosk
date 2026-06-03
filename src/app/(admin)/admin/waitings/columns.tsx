"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { waitingQueue, items, generalUsers } from "@drizzle/schema";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { grantWaitingEntry, cancelWaitingEntry } from "@/lib/actions/waiting"; // 이 액션들은 나중에 구현합니다.

export type WaitingEntry = typeof waitingQueue.$inferSelect & {
  itemName?: string | null;
  userName?: string | null;
  rentalTimeMinutes?: number | null;
  quantity?: number | null;
};

export const columns: ColumnDef<WaitingEntry>[] = [
  {
    header: "대기 순번",
    cell: ({ row }) => {
      return <div>{row.index + 1}</div>;
    },
  },
  {
    accessorKey: "id",
    header: "ID",
  },
  {
    accessorKey: "itemName",
    header: "아이템",
  },
  {
    accessorKey: "rentalTimeMinutes",
    header: "대여 시간(분)",
    cell: ({ row }) => {
      const minutes = row.original.rentalTimeMinutes;
      return <div>{minutes ? `${minutes}분` : "-"}</div>;
    },
  },
  {
    accessorKey: "quantity",
    header: "보유 수량",
    cell: ({ row }) => {
      const qty = row.original.quantity;
      return <div>{qty ? `${qty}개` : "-"}</div>;
    },
  },
  {
    accessorKey: "userName",
    header: "사용자",
  },
  {
    accessorKey: "requestDate",
    header: "요청일",
    cell: ({ row }) => {
      const timestampInSeconds = row.getValue("requestDate") as number;
      if (!timestampInSeconds || typeof timestampInSeconds !== "number") {
        return <span>-</span>;
      }
      const date = new Date(timestampInSeconds * 1000);
      return <div>{date.toLocaleString("ko-KR")}</div>;
    },
  },

  {
    id: "actions",
    cell: ({ row }) => {
      const entry = row.original;
      const router = useRouter();

      const handleGrant = async () => {
        const result = await grantWaitingEntry(entry.id);
        if (result.success) {
          toast.success("대기열 항목이 승인되었습니다.");
          router.refresh();
        } else {
          toast.error(result.error || "대기열 항목 승인 실패");
        }
      };

      const handleCancel = async () => {
        const result = await cancelWaitingEntry(entry.id);
        if (result.success) {
          toast.success("대기열 항목이 취소되었습니다.");
          router.refresh();
        } else {
          toast.error(result.error || "대기열 항목 취소 실패");
        }
      };

      return (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">메뉴 열기</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>액션</DropdownMenuLabel>
            <DropdownMenuItem onClick={handleGrant}>대여 처리</DropdownMenuItem>
            <DropdownMenuItem onClick={handleCancel} className="text-red-500">
              대기 취소
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(String(entry.id))}
            >
              ID 복사
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
