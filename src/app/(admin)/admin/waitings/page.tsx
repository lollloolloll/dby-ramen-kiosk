import { getWaitingQueueEntries } from "@/lib/actions/waiting";
import {
  getActiveRentalsWithWaitCount,
  getItemOccupancyBoard,
  processAndMutateExpiredRentals,
} from "@/lib/actions/rental";
import { WaitingPageClient } from "./WaitingPageClient";

export const dynamic = "force-dynamic";

interface WaitingPageProps {
  params?: Promise<{ [key: string]: string | string[] }>;
  searchParams?: Promise<{ page?: string; per_page?: string }>;
}

export default async function WaitingPage({ searchParams }: WaitingPageProps) {
  const params = await searchParams;
  const page = parseInt(
    Array.isArray(params?.page) ? params?.page[0] : params?.page || "1"
  );
  const per_page = parseInt(
    Array.isArray(params?.per_page)
      ? params?.per_page[0]
      : params?.per_page || "10"
  );

  // 관제탑 진입 시 만료 자동반납 + 대기자 승급 처리(렌더 중 안전한 비-revalidate 버전).
  // 다른 admin 페이지와 동일 패턴 — 이게 없으면 만료된 대여가 보드에 stale로 남는다.
  await processAndMutateExpiredRentals();

  const [waitingResult, activeRentalsResult, occupancyResult] =
    await Promise.all([
      getWaitingQueueEntries({ page, per_page }),
      getActiveRentalsWithWaitCount(),
      getItemOccupancyBoard(),
    ]);

  const { data: waitingEntries, total_count } = waitingResult;
  const { data: activeRentals } = activeRentalsResult;
  const { data: occupancy } = occupancyResult;

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">대기열 아이템 관제탑</h1>
      <WaitingPageClient
        occupancy={occupancy || []}
        activeRentals={activeRentals || []}
        waitingEntries={waitingEntries || []}
        page={page}
        per_page={per_page}
        total_count={total_count || 0}
      />
    </div>
  );
}
