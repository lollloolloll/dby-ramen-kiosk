import { DbaseKioskFlow } from "@/components/dbase/DbaseKioskFlow";
import { getAllItems } from "@/lib/actions/item";

export const dynamic = "force-dynamic";

export default async function DbyKioskPage({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const isPreview = params?.preview === "1";
  const items = await getAllItems({ skipProcess: isPreview });

  return <DbaseKioskFlow items={items} />;
}
