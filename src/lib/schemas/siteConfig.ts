import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const marqueeItemSchema = z.object({
  emoji: z.string().min(1).max(4),
  label: z.string().min(1).max(20),
});

export const stickerEmojiSchema = z.object({
  emoji: z.string().min(1).max(4),
});

export const defaultMarqueeItems = [
  { emoji: "🎮", label: "닌텐도 스위치" },
  { emoji: "🍜", label: "라면" },
  { emoji: "🎲", label: "보드게임" },
  { emoji: "🏸", label: "배드민턴" },
  { emoji: "🍿", label: "맛있는 간식" },
  { emoji: "🏀", label: "농구" },
  { emoji: "🏓", label: "탁구" },
] as const;

export const defaultStickerEmojis = [
  { emoji: "🎮" },
  { emoji: "🎤" },
  { emoji: "🎲" },
  { emoji: "🍜" },
] as const;

export const siteConfigSchema = z.object({
  colorPrimary: hexColor,
  colorAccent: hexColor,
  colorTextMain: hexColor,
  colorTextMuted: hexColor,
  colorBackground: hexColor,
  overrideCtaBg: hexColor.nullable(),
  overrideHeadlineGradFrom: hexColor.nullable(),
  overrideHeadlineGradTo: hexColor.nullable(),
  overrideFilterActiveBg: hexColor.nullable(),

  orgName: z.string().trim().min(1).max(20),
  homeBadge1: z.string().trim().max(30),
  homeBadge2: z.string().trim().max(40),
  homeHeadlineTop: z.string().trim().min(1).max(30),
  homeHeadlineBottom: z.string().trim().min(1).max(30),
  homeSubcopy: z.string().trim().max(40),
  homeCtaLabel: z.string().trim().min(1).max(20),
  kioskTitle: z.string().trim().min(1).max(30),
  kioskEmptyTitle: z.string().trim().max(50),
  kioskEmptySubtitle: z.string().trim().max(50),

  marqueeItems: z.array(marqueeItemSchema).min(1).max(20),
  stickerEmojis: z.array(stickerEmojiSchema).length(4),

  showLavaLamp: z.boolean(),
  showStickers: z.boolean(),
  showMarquee: z.boolean(),
  showFilters: z.boolean(),
  showKioskBgGradient: z.boolean(),

  backgroundType: z.enum(["image", "video"]).nullable(),
  backgroundPath: z.string().nullable(),
  backgroundOverlayOpacity: z.number().int().min(0).max(80),
  logoPath: z.string().nullable(),

  kioskGridCols: z.number().int().min(2).max(5),
  inactivityTimeoutMs: z.number().int().min(30_000).max(300_000),

  visualPreset: z.enum(["lava", "aurora", "wave", "none"]),
  defaultItemImagePath: z.string().nullable(),
});

export type MarqueeItem = z.infer<typeof marqueeItemSchema>;
export type StickerEmoji = z.infer<typeof stickerEmojiSchema>;
export type SiteConfigInput = z.infer<typeof siteConfigSchema>;

export interface SiteConfig extends SiteConfigInput {
  id: number;
  updatedAt: number | string;
}

export type SiteConfigRow = Omit<
  SiteConfigInput,
  "marqueeItems" | "stickerEmojis"
> & {
  id: number;
  updatedAt: number | string;
  marqueeItemsJson: string;
  stickerEmojisJson: string;
};

export const defaultSiteConfigValues: SiteConfigInput = {
  colorPrimary: "#5FD4A5",
  colorAccent: "#E896C0",
  colorTextMain: "#1e293b",
  colorTextMuted: "#64748b",
  colorBackground: "#f8fafc",
  overrideCtaBg: null,
  overrideHeadlineGradFrom: null,
  overrideHeadlineGradTo: null,
  overrideFilterActiveBg: null,
  orgName: "쌍청문",
  homeBadge1: "우리들의 아지트",
  homeBadge2: "나의 미성숙함이 머물다 가는 곳",
  homeHeadlineTop: "학교 끝나고",
  homeHeadlineBottom: "뭐하고 놀래?",
  homeSubcopy: "으로 다 모여! 🎉",
  homeCtaLabel: "😎 놀 준비 완료!",
  kioskTitle: "쉬다 대여 목록",
  kioskEmptyTitle: "현재 대여가능한 상품이 없습니다.",
  kioskEmptySubtitle: "관리자에게 문의해주세요.",
  marqueeItems: [...defaultMarqueeItems],
  stickerEmojis: [...defaultStickerEmojis],
  showLavaLamp: true,
  showStickers: true,
  showMarquee: true,
  showFilters: true,
  showKioskBgGradient: true,
  backgroundType: null,
  backgroundPath: null,
  backgroundOverlayOpacity: 30,
  logoPath: null,
  kioskGridCols: 4,
  inactivityTimeoutMs: 60_000,
  visualPreset: "lava",
  defaultItemImagePath: null,
};

function parseJsonArray<T>(raw: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeSiteConfigRow(row: SiteConfigRow): SiteConfig {
  const marqueeItems = parseJsonArray(
    row.marqueeItemsJson,
    [...defaultMarqueeItems]
  );
  const stickerEmojis = parseJsonArray(
    row.stickerEmojisJson,
    [...defaultStickerEmojis]
  );

  const parsed = siteConfigSchema.parse({
    ...defaultSiteConfigValues,
    ...row,
    marqueeItems,
    stickerEmojis,
  });

  return {
    id: row.id,
    updatedAt: row.updatedAt,
    ...parsed,
  };
}

export function toSiteConfigDbValues(input: SiteConfigInput) {
  const parsed = siteConfigSchema.parse(input);
  const { marqueeItems, stickerEmojis, ...rest } = parsed;

  return {
    ...rest,
    marqueeItemsJson: JSON.stringify(marqueeItems),
    stickerEmojisJson: JSON.stringify(stickerEmojis),
  };
}
