"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { deleteRentalRecord } from "@/lib/actions/rental";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { formatDbaseHeadcount } from "@/lib/dbase/session";

export type RentalRecord = {
  id: number;
  userId: number; // Added userId
  userPhone: string | null;
  userSchool: string | null;
  rentalDate: Date | null;
  userName: string | null;
  itemName: string | null;
  maleCount: number | null;
  femaleCount: number | null;
  visitSessionId?: number | null;
  visitTotalCount?: number | null;
  visitYouthMale?: number | null;
  visitYouthFemale?: number | null;
  visitAdultMale?: number | null;
  visitAdultFemale?: number | null;
};

export const columns: ColumnDef<RentalRecord>[] = [
  {
    accessorKey: "id",
    header: "ID",
  },
  {
    accessorKey: "userName",
    header: "사용자",
  },
  {
    accessorKey: "userSchool",
    header: "학교",
    cell: ({ row }) => {
      return <div>{row.getValue("userSchool") || "-"}</div>;
    },
  },
  {
    accessorKey: "itemName",
    header: "물품",
  },
  {
    header: "대여인원",
    cell: ({ row }) => {
      const maleCount = row.original.maleCount ?? 0;
      const femaleCount = row.original.femaleCount ?? 0;
      return `남: ${maleCount}, 여: ${femaleCount}`;
    },
  },
  {
    header: "D.BASE 방문",
    cell: ({ row }) => {
      const record = row.original;
      const summary =
        record.visitSessionId && typeof record.visitTotalCount === "number"
          ? {
              totalCount: record.visitTotalCount,
              youthMale: record.visitYouthMale ?? 0,
              youthFemale: record.visitYouthFemale ?? 0,
              adultMale: record.visitAdultMale ?? 0,
              adultFemale: record.visitAdultFemale ?? 0,
            }
          : null;

      return <span className="text-xs">{formatDbaseHeadcount(summary)}</span>;
    },
  },
  {
    accessorKey: "rentalDate",
    header: "대여일시",
    size: 180, // Adjust this value as needed
    cell: ({ row }) => {
      const timestampInSeconds = row.getValue("rentalDate") as number;

      if (!timestampInSeconds || typeof timestampInSeconds !== "number") {
        return <span>-</span>;
      }

      const date = new Date(timestampInSeconds * 1000);
      return <div>{date.toLocaleString("ko-KR")}</div>;
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const record = row.original;
      const router = useRouter();

      const handleDelete = async () => {
        if (window.confirm("정말로 이 대여 기록을 삭제하시겠습니까?")) {
          const result = await deleteRentalRecord(record.id);
          if (result.success) {
            toast.success("삭제 성공", {
              description: result.message,
            });
            router.refresh(); // 페이지를 새로고침하여 변경사항 반영
          } else {
            toast.error("삭제 실패", {
              description: result.error,
            });
          }
        }
      };

      return (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={(event) => {
                event.stopPropagation(); // 드롭다운 메뉴 트리거 클릭 시 이벤트 전파 중지
              }}
            >
              <span className="sr-only">메뉴 열기</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                handleDelete();
              }}
              className="text-red-500"
            >
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
