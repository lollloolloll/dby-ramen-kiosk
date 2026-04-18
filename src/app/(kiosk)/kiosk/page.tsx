// app/kiosk/page.tsx
import { getAllItems } from "@/lib/actions/item";
import { getConsentFile } from "@/lib/actions/consent"; // 새로 만들 액션
import { KioskPageClient } from "./KioskPageClient";

export const dynamic = "force-dynamic";

export default async function KioskPage({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const isPreview = params?.preview === "1";
  const [items, consentFile] = await Promise.all([
    getAllItems({ skipProcess: isPreview }),
    getConsentFile(),
  ]);

  return <KioskPageClient items={items} consentFile={consentFile} />;
}
