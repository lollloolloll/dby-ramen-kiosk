"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { generalUsers, users } from "@drizzle/schema";
import { deleteGeneralUser, deleteAdminUser } from "@/lib/actions/generalUser";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { EditUserForm } from "./EditUserForm";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { getSchoolLevel } from "@/lib/shared/school";

type GeneralUser = typeof generalUsers.$inferSelect;
type AdminUser = typeof users.$inferSelect;

const handleDeleteGeneralUser = async (id: number) => {
  const result = await deleteGeneralUser(id);
  if (result.success) {
    toast.success("사용자가 삭제되었습니다.");
  } else {
    toast.error(result.error);
  }
};

const handleDeleteAdminUser = async (id: number) => {
  const result = await deleteAdminUser(id);
  if (result.success) {
    toast.success("관리자가 삭제되었습니다.");
  } else {
    toast.error(result.error);
  }
};

export const generalUserColumns: ColumnDef<GeneralUser>[] = [
  {
    accessorKey: "id",
    header: "ID",
  },
  {
    accessorKey: "name",
    header: "이름",
  },
  {
    accessorKey: "phoneNumber",
    header: "전화번호",
  },
  {
    accessorKey: "gender",
    header: "성별",
  },
  {
    accessorKey: "birthDate",
    header: "생년월일",
  },
  {
    accessorKey: "school",
    header: "교급",
    cell: ({ row }) => getSchoolLevel(row.getValue("school")),
  },
  {
    accessorKey: "personalInfoConsent",
    header: "개인정보동의",
    cell: ({ row }) => {
      const consent = row.getValue("personalInfoConsent");
      return consent ? "동의" : "비동의";
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original;
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
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                navigator.clipboard.writeText(String(user.id));
              }}
            >
              Copy User ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <EditUserForm user={user}>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => event.stopPropagation()}
              >
                Edit
              </DropdownMenuItem>
            </EditUserForm>
            <DeleteUserDialog userId={user.id}>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => event.stopPropagation()}
                className="text-red-500"
              >
                Delete
              </DropdownMenuItem>
            </DeleteUserDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export const adminUserColumns: ColumnDef<AdminUser>[] = [
  {
    accessorKey: "id",
    header: "ID",
  },
  {
    accessorKey: "username",
    header: "사용자 이름",
  },
  {
    accessorKey: "role",
    header: "역할",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original;
      return (
        <Button
          variant="destructive"
          onClick={() => handleDeleteAdminUser(user.id)}
        >
          삭제
        </Button>
      );
    },
  },
];
