import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// D.BASE 키오스크 문구 override. 편집 가능한 키만, 전부 optional(비우면 copy.ts 기본값).
export const dbaseCopyOverrideSchema = z
  .object({
    brandEyebrow: z.string().trim().max(40),
    entryTitle: z.string().trim().max(40),
    entryFirstTime: z.string().trim().max(20),
    entryReturning: z.string().trim().max(20),
    registerTitle: z.string().trim().max(40),
    identifyTitle: z.string().trim().max(40),
    mismatchTitle: z.string().trim().max(50),
    mismatchBody: z.string().trim().max(40),
    headcountTitle: z.string().trim().max(40),
    contentsTitle: z.string().trim().max(40),
    doneTitle: z.string().trim().max(40),
    doneSubtitle: z.string().trim().max(50),
  })
  .partial();

export const siteConfigSchema = z.object({
  colorPrimary: hexColor,
  colorAccent: hexColor,
  colorTextMain: hexColor,
  colorBackground: hexColor,

  orgName: z.string().trim().min(1).max(20),
  homeBadge1: z.string().trim().max(30),
  homeBadge2: z.string().trim().max(40),
  homeHeadlineTop: z.string().trim().min(1).max(30),
  homeHeadlineBottom: z.string().trim().min(1).max(30),
  homeSubcopy: z.string().trim().max(40),
  homeCtaLabel: z.string().trim().min(1).max(20),
  kioskTitle: z.string().trim().min(1).max(30),

  backgroundType: z.enum(["image", "video"]).nullable(),
  backgroundPath: z.string().nullable(),
  backgroundOverlayOpacity: z.number().int().min(0).max(80),
  logoPath: z.string().nullable(),

  kioskGridCols: z.number().int().min(2).max(5),
  inactivityTimeoutMs: z.number().int().min(30_000).max(300_000),

  visualPreset: z.enum(["lava", "aurora", "wave", "none"]),
  defaultItemImagePath: z.string().nullable(),

  // .default() 를 쓰면 input(optional)≠output(required) 발산으로 zodResolver 타입이
  // useForm<SiteConfigInput>(output)과 안 맞는다. 항상 값을 제공하므로 required로 둔다.
  dbaseCopy: dbaseCopyOverrideSchema,
});

export type SiteConfigInput = z.infer<typeof siteConfigSchema>;

export interface SiteConfig extends SiteConfigInput {
  id: number;
  updatedAt: number | string;
}

export type SiteConfigRow = Omit<SiteConfigInput, "dbaseCopy"> & {
  id: number;
  updatedAt: number | string;
  dbaseCopyJson: string;
};

export const defaultSiteConfigValues: SiteConfigInput = {
  colorPrimary: "#5FD4A5",
  colorAccent: "#E896C0",
  colorTextMain: "#1e293b",
  colorBackground: "#f8fafc",
  orgName: "D.Base",
  homeBadge1: "",
  homeBadge2: "",
  homeHeadlineTop: "필요한 물품",
  homeHeadlineBottom: "간편하게 대여",
  homeSubcopy: "",
  homeCtaLabel: "시작하기",
  kioskTitle: "대여 목록",
  backgroundType: null,
  backgroundPath: null,
  backgroundOverlayOpacity: 30,
  logoPath: null,
  kioskGridCols: 4,
  inactivityTimeoutMs: 60_000,
  visualPreset: "lava",
  defaultItemImagePath: null,
  dbaseCopy: {},
};

function parseJsonObject<T extends Record<string, unknown>>(
  raw: string,
  fallback: T
): T {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as T)
      : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeSiteConfigRow(row: SiteConfigRow): SiteConfig {
  const dbaseCopy = parseJsonObject<Record<string, string>>(
    row.dbaseCopyJson ?? "{}",
    {}
  );

  const parsed = siteConfigSchema.parse({
    ...defaultSiteConfigValues,
    ...row,
    dbaseCopy,
  });

  return {
    id: row.id,
    updatedAt: row.updatedAt,
    ...parsed,
  };
}

export function toSiteConfigDbValues(input: SiteConfigInput) {
  const parsed = siteConfigSchema.parse(input);
  const { dbaseCopy, ...rest } = parsed;

  return {
    ...rest,
    dbaseCopyJson: JSON.stringify(dbaseCopy ?? {}),
  };
}
