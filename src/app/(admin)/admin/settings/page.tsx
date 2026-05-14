import { getKioskSettings } from "@/lib/actions/settings";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const settings = await getKioskSettings();

  return (
    <div className="container px-16 py-10">
      <SettingsClient
        initialSchoolReconfirmMode={settings.schoolReconfirmMode}
      />
    </div>
  );
}
