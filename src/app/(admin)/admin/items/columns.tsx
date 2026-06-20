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
import { GripVertical, MoreHorizontal } from "lucide-react";
import { items } from "@drizzle/schema";
import { EditItemForm } from "./EditItemForm";
import { DeleteItemDialog } from "./DeleteItemDialog";
import { Switch } from "@/components/ui/switch";
import {
  toggleItemVisibility,
  toggleItemDeletedStatus,
} from "@/lib/actions/item";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type BaseItem = typeof items.$inferSelect;

// 2. API 응답에 포함될, 계산된 추가 속성을 정의합니다.
interface ItemComputedFields {
  status: "RENTED" | "AVAILABLE";
  waitingCount: number;
  returnDueDate: number | null;
}

// 3. 기본 타입과 계산된 속성을 결합(&)하여 최종 Item 타입을 만듭니다.
// 이 타입이 프론트엔드 컴포넌트에서 실제로 사용될 API 응답 객체의 타입입니다.
export type Item = BaseItem & ItemComputedFields;

export const columns: ColumnDef<Item>[] = [
  {
    id: "drag-handle",
    header: "",
    cell: (context: any) => {
      const { dragHandleProps } = context;

      return (
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing p-2"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const item = row.original;
      return (
        <span className={cn({ "text-muted-foreground": item.isDeleted })}>
          {item.name}
        </span>
      );
    },
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => {
      const item = row.original;
      return (
        <span className={cn({ "text-muted-foreground": item.isDeleted })}>
          {item.category}
        </span>
      );
    },
  },
  {
    accessorKey: "imageUrl",
    header: "Image", // 헤더 텍스트를 더 간결하게 변경
    cell: ({ row }) => {
      // 현재 행(row)의 원본 데이터(original)에서 값을 가져옵니다.
      const imageUrl = row.original.imageUrl;
      const itemName = row.original.name;

      // 이미지 URL이 존재하면 img 태그를, 없으면 대체 텍스트를 보여줍니다.
      return imageUrl ? (
        <img
          src={imageUrl}
          alt={`${itemName} 이미지`}
          className="h-16 w-16 rounded-md object-cover mx-auto" // 이미지 크기와 스타일 지정, mx-auto로 중앙 정렬
        />
      ) : (
        <span className="text-muted-foreground">이미지 없음</span>
      );
    },
  },
  {
    accessorKey: "isHidden",
    header: "Hidden",
    cell: ({ row }) => {
      const item = row.original;
      const isChecked = !item.isHidden; // isHidden이 true면 체크 해제 (숨김), false면 체크 (표시)

      const handleToggle = async (newCheckedState: boolean) => {
        const newIsHidden = !newCheckedState; // Switch의 checked 상태와 isHidden은 반대
        const result = await toggleItemVisibility(item.id, newIsHidden);
        if (result.success) {
          toast.success("아이템 숨김처리 업데이트.");
        } else {
          toast.error(result.error || "아이템 숨김처리 업데이트 실패");
        }
      };

      return <Switch checked={isChecked} onCheckedChange={handleToggle} />;
    },
  },
  // 숨김(D.Base 전용 배포) — smy 대여 흐름용 컬럼. 복원하려면 주석 해제.
  // {
  //   accessorKey: "isAutomaticGenderCount",
  //   header: "성별 자동 입력",
  //   cell: ({ row }) => {
  //     const isAutomaticGenderCount = row.original.isAutomaticGenderCount;
  //     return <span>{isAutomaticGenderCount ? "예" : "아니오"}</span>;
  //   },
  // },
  // 숨김(D.Base 전용 배포) — smy 대여 흐름용 컬럼. 복원하려면 주석 해제.
  // {
  //   accessorKey: "enableParticipantTracking",
  //   header: "대여 인원 추적",
  //   cell: ({ row }) => {
  //     const enableParticipantTracking = row.original.enableParticipantTracking;
  //     return <span>{enableParticipantTracking ? "예" : "아니오"}</span>;
  //   },
  // },
  {
    id: "actions",
    cell: ({ row }) => {
      const item = row.original;

      const handleToggleDelete = async () => {
        const result = await toggleItemDeletedStatus(item.id, !item.isDeleted);
        if (result.success) {
          toast.success(
            `아이템이 성공적으로 ${item.isDeleted ? "복구" : "삭제"}되었습니다.`
          );
        } else {
          toast.error(result.error || "작업에 실패했습니다.");
        }
      };

      return (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(String(item.id))}
            >
              Copy Item ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <EditItemForm item={item}>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                disabled={item.isDeleted}
              >
                Edit
              </DropdownMenuItem>
            </EditItemForm>
            <DropdownMenuItem
              onClick={handleToggleDelete}
              className={cn({
                "text-red-500": !item.isDeleted,
                "text-green-500": item.isDeleted,
              })}
            >
              {item.isDeleted ? "Restore" : "Delete"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
