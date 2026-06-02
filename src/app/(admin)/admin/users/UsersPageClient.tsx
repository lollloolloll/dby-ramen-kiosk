"use client";

import { useState, useEffect, useRef } from "react";
import { generalUsers } from "@drizzle/schema";
import { DataTable } from "@/components/ui/data-table";
import { generalUserColumns } from "./columns";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddUserForm } from "./AddUserForm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RentalHistoryForm } from "@/lib/shared/rentalHistoryForm";
import { ArrowUp, ArrowDown, FileDown } from "lucide-react";
import { Pagination } from "@/lib/shared/pagination";
import { useRouter, useSearchParams } from "next/navigation";
import { useDebounce } from "@/lib/shared/use-debounce";
import { exportGeneralUsersToExcel } from "@/lib/actions/generalUser";
import { getAllItemNames } from "@/lib/actions/rental";

type GeneralUser = typeof generalUsers.$inferSelect;

interface UsersPageClientProps {
  generalUsers: GeneralUser[];
  page: number;
  per_page: number;
  total_count: number;
  sort: string;
  order: string;
  search: string;
}

export function UsersPageClient({
  generalUsers,
  page,
  per_page,
  total_count,
  sort,
  order,
  search,
}: UsersPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchTerm, setSearchTerm] = useState(search);
  const debouncedSearch = useDebounce(searchTerm, 500);
  // ref에서 type 제거, term만 추적
  const prevSearchRef = useRef(search);

  const [isRentalHistoryDialogOpen, setIsRentalHistoryDialogOpen] =
    useState(false);
  const [selectedUserForHistory, setSelectedUserForHistory] = useState<{
    userId: number;
    username: string;
  } | null>(null);
  const [availableItems, setAvailableItems] = useState<string[]>([]);

  const handleRowClick = (user: GeneralUser, event: React.MouseEvent) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest('[role="dialog"]')
    ) {
      return;
    }
    setSelectedUserForHistory({ userId: user.id, username: user.name });
    setIsRentalHistoryDialogOpen(true);
  };

  useEffect(() => {
    // 검색어가 변경되었을 때만 실행
    if (debouncedSearch !== prevSearchRef.current) {
      prevSearchRef.current = debouncedSearch;

      const params = new URLSearchParams(searchParams);
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      } else {
        params.delete("search");
      }
      params.set("page", "1");
      router.push(`?${params.toString()}`);
    }
  }, [debouncedSearch, router, searchParams]);

  useEffect(() => {
    async function fetchItemNames() {
      const result = await getAllItemNames();
      if (result.success && result.data) {
        setAvailableItems(result.data);
      } else {
        console.error("Failed to fetch item names:", result.error);
      }
    }
    fetchItemNames();
  }, []);

  const handleSortChange = (newSortOrder: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("sort", newSortOrder);
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  };

  const handleDirectionChange = () => {
    const params = new URLSearchParams(searchParams);
    const currentOrder = params.get("order") || "asc";
    params.set("order", currentOrder === "asc" ? "desc" : "asc");
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  };

  return (
    <div>
      <div className="mb-8">
        <div className="flex justify-end items-center mb-4 gap-2">
          <div className="flex items-center gap-2">
            <Select onValueChange={handleSortChange} value={sort}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="정렬" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="age">나이순</SelectItem>
                <SelectItem value="name">이름순</SelectItem>
                <SelectItem value="createdAt">생성순</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={handleDirectionChange}
            >
              {order === "asc" ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
            </Button>
            <Input
              placeholder="이름 또는 전화번호 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-[250px] mr-2"
            />
            <Dialog>
              <DialogTrigger asChild>
                <Button>사용자 추가</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>사용자 추가</DialogTitle>
                </DialogHeader>
                <AddUserForm />
              </DialogContent>
            </Dialog>
            <Button
              onClick={async () => {
                const result = await exportGeneralUsersToExcel();
                if (result.success && result.buffer && result.mimeType) {
                  const link = document.createElement("a");
                  link.href = `data:${result.mimeType};base64,${result.buffer}`;
                  link.download = `D.base_사용자정보_${new Date().toISOString()}.xlsx`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                } else {
                  alert(result.error || "엑셀 내보내기 실패");
                }
              }}
              className="flex items-center space-x-2"
            >
              <FileDown className="h-4 w-4" />
              <span>엑셀 내보내기</span>
            </Button>
          </div>
        </div>

        <DataTable
          columns={generalUserColumns}
          data={generalUsers}
          onRowClick={(user, event) => handleRowClick(user, event)}
        />
      </div>
      <Pagination page={page} per_page={per_page} total_count={total_count} />

      {selectedUserForHistory && (
        <Dialog
          open={isRentalHistoryDialogOpen}
          onOpenChange={setIsRentalHistoryDialogOpen}
        >
          <RentalHistoryForm
            userId={selectedUserForHistory.userId}
            username={selectedUserForHistory.username}
            availableItems={availableItems}
          />
        </Dialog>
      )}
    </div>
  );
}
