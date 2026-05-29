import { KioskPageClient } from "./KioskPageClient";
import { getConsentFile } from "@/lib/actions/consent";
import { getAllItems } from "@/lib/actions/item";
import { getKioskSettings } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

export default async function SmyKioskPage({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const isPreview = params?.preview === "1";
  const [items, consentFile, settings] = await Promise.all([
    getAllItems({ skipProcess: isPreview }),
    getConsentFile(),
    getKioskSettings(),
  ]);

  return (
    <KioskPageClient
      items={items}
      consentFile={consentFile}
      schoolReconfirmMode={settings.schoolReconfirmMode}
    />
  );
}
