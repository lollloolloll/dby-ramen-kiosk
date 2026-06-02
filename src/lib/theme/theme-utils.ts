import type { SiteConfigInput } from "@/lib/schemas/siteConfig";

type ThemeVarsSource = Pick<
  SiteConfigInput,
  | "colorPrimary"
  | "colorAccent"
  | "colorTextMain"
  | "colorBackground"
  | "backgroundOverlayOpacity"
>;

/**
 * 배경색 위에 올라갈 글자색을 자동으로 검정/흰색 중 가독성 높은 쪽으로 고른다.
 * WCAG 상대 휘도 기준. 운영자가 파스텔 등 밝은 색을 골라도 글자가 안 깨지게.
 */
export function getReadableTextColor(hex: string): string {
  const normalized = hex.trim().replace(/^#/, "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;

  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) {
    return "#ffffff";
  }

  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const r = toLinear(parseInt(full.slice(0, 2), 16));
  const g = toLinear(parseInt(full.slice(2, 4), 16));
  const b = toLinear(parseInt(full.slice(4, 6), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return luminance > 0.5 ? "#0a0a0a" : "#ffffff";
}

export function toThemeCssVars(config: ThemeVarsSource) {
  return {
    "--brand-primary": config.colorPrimary,
    "--brand-accent": config.colorAccent,
    "--brand-text": config.colorTextMain,
    "--brand-bg": config.colorBackground,
    // brand-primary 배경 위 글자색 (footer·카트바·CTA 버튼). 자동 대비.
    "--brand-on-primary": getReadableTextColor(config.colorPrimary),
    "--bg-overlay-opacity": `${config.backgroundOverlayOpacity / 100}`,
  } satisfies Record<string, string>;
}

export function applyThemeCssVars(
  target: HTMLElement,
  config: ThemeVarsSource
) {
  const vars = toThemeCssVars(config);

  Object.entries(vars).forEach(([key, value]) => {
    target.style.setProperty(key, value);
  });
}

export function hasBackgroundMedia(backgroundPath: string | null) {
  return Boolean(backgroundPath);
}

export function getGridColsClass(cols: number) {
  switch (cols) {
    case 2:
      return "grid-cols-2";
    case 3:
      return "grid-cols-3";
    case 5:
      return "grid-cols-5";
    case 4:
    default:
      return "grid-cols-4";
  }
}
