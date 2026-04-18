import { getSiteConfig } from "@/lib/actions/siteConfig";
import { ThemeBuilderClient } from "./ThemeBuilderClient";

export default async function ThemePage() {
  const config = await getSiteConfig();

  return <ThemeBuilderClient initialConfig={config} />;
}
