import { DbaseKioskFlow } from "@/components/dbase/DbaseKioskFlow";
import { getAllItems } from "@/lib/actions/item";
import { getItemOccupancyBoard } from "@/lib/actions/rental";

export const dynamic = "force-dynamic";

export default async function DbyKioskPage({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const isPreview = params?.preview === "1";
  // getAllItems가 먼저 만료 처리 → 그 후 점유 현황을 읽어 카드 배지로 전달
  const items = await getAllItems({ skipProcess: isPreview });
  const occupancy = await getItemOccupancyBoard();

  return <DbaseKioskFlow items={items} occupancy={occupancy.data} />;
}
