"use client";

import { DataTable } from "@/components/ui/data-table";
import { columns, WaitingEntry } from "./columns";
import {
  activeRentalsColumns,
  ActiveRental,
} from "./active-rentals-columns";
import { occupancyColumns, OccupancyRow } from "./occupancy-columns";
import { Pagination } from "@/lib/shared/pagination";

interface WaitingPageClientProps {
  occupancy: OccupancyRow[];
  activeRentals: ActiveRental[];
  waitingEntries: WaitingEntry[];
  page: number;
  per_page: number;
  total_count: number;
}

export function WaitingPageClient({
  occupancy,
  activeRentals,
  waitingEntries,
  page,
  per_page,
  total_count,
}: WaitingPageClientProps) {
  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-2xl font-bold mb-4">아이템 관제탑 (점유·잔여)</h2>
        <DataTable columns={occupancyColumns} data={occupancy} />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-4">현재 이용 현황</h2>
        <DataTable columns={activeRentalsColumns} data={activeRentals} />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-4">대기열 목록</h2>
        <div className="mb-8">
          <DataTable columns={columns} data={waitingEntries} />
        </div>
        <Pagination
          page={page}
          per_page={per_page}
          total_count={total_count}
        />
      </div>
    </div>
  );
}
