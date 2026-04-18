"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteConfig } from "@drizzle/schema";
import {
  defaultSiteConfigValues,
  normalizeSiteConfigRow,
  siteConfigSchema,
  toSiteConfigDbValues,
  type SiteConfig,
  type SiteConfigInput,
  type SiteConfigRow,
} from "@/lib/schemas/siteConfig";

const SITE_CONFIG_ID = 1;
const SITE_CONFIG_TAG = "site-config";
const SQLITE_MISSING_TABLE = "no such table: site_config";

function isMissingSiteConfigTableError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes(SQLITE_MISSING_TABLE)
  );
}

function getDefaultSiteConfig(): SiteConfig {
  return {
    id: SITE_CONFIG_ID,
    updatedAt: Date.now(),
    ...defaultSiteConfigValues,
  };
}

async function ensureSiteConfigRow() {
  await db
    .insert(siteConfig)
    .values({
      id: SITE_CONFIG_ID,
      ...toSiteConfigDbValues(defaultSiteConfigValues),
    })
    .onConflictDoNothing();
}

const getCachedSiteConfig = unstable_cache(
  async (): Promise<SiteConfig> => {
    try {
      await ensureSiteConfigRow();

      const row = await db.query.siteConfig.findFirst({
        where: eq(siteConfig.id, SITE_CONFIG_ID),
      });

      if (!row) {
        throw new Error("site_config row is missing");
      }

      return normalizeSiteConfigRow(row as SiteConfigRow);
    } catch (error) {
      if (isMissingSiteConfigTableError(error)) {
        return getDefaultSiteConfig();
      }

      throw error;
    }
  },
  [SITE_CONFIG_TAG],
  { tags: [SITE_CONFIG_TAG] }
);

export async function getSiteConfig() {
  return getCachedSiteConfig();
}

export async function updateSiteConfig(input: SiteConfigInput) {
  const parsed = siteConfigSchema.parse(input);

  await ensureSiteConfigRow();

  await db
    .update(siteConfig)
    .set({
      ...toSiteConfigDbValues(parsed),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(siteConfig.id, SITE_CONFIG_ID));

  revalidateTag(SITE_CONFIG_TAG);
  return getCachedSiteConfig();
}

export async function updateSiteConfigMedia(input: {
  backgroundPath?: string | null;
  backgroundType?: "image" | "video" | null;
  logoPath?: string | null;
}) {
  await ensureSiteConfigRow();

  await db
    .update(siteConfig)
    .set({
      ...(input.backgroundPath !== undefined
        ? { backgroundPath: input.backgroundPath }
        : {}),
      ...(input.backgroundType !== undefined
        ? { backgroundType: input.backgroundType }
        : {}),
      ...(input.logoPath !== undefined ? { logoPath: input.logoPath } : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(siteConfig.id, SITE_CONFIG_ID));

  revalidateTag(SITE_CONFIG_TAG);
  return getCachedSiteConfig();
}
