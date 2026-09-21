import { DbaseKioskFlow } from "@/components/dbase/DbaseKioskFlow";
import { getAllItems } from "@/lib/actions/item";
import { getKioskSettings } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

export default async function DbyKioskPage({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const isPreview = params?.preview === "1";
  const [items, settings] = await Promise.all([
    getAllItems({ skipProcess: isPreview }),
    getKioskSettings(),
  ]);

  return (
    <DbaseKioskFlow
      items={items}
      schoolReconfirmMode={settings.schoolReconfirmMode}
    />
  );
}
