// app/kiosk/page.tsx
import { getAllItems } from "@/lib/actions/item";
import { getConsentFile } from "@/lib/actions/consent"; // 새로 만들 액션
import { KioskPageClient } from "./KioskPageClient";
import { getKioskSettings } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

export default async function KioskPage({
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
