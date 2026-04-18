import type { SiteConfigInput } from "@/lib/schemas/siteConfig";

type ThemeVarsSource = Pick<
  SiteConfigInput,
  | "colorPrimary"
  | "colorAccent"
  | "colorTextMain"
  | "colorTextMuted"
  | "overrideCtaBg"
  | "overrideHeadlineGradFrom"
  | "overrideHeadlineGradTo"
  | "overrideFilterActiveBg"
  | "backgroundOverlayOpacity"
>;

export function toThemeCssVars(config: ThemeVarsSource) {
  return {
    "--brand-primary": config.colorPrimary,
    "--brand-accent": config.colorAccent,
    "--brand-text": config.colorTextMain,
    "--brand-muted": config.colorTextMuted,
    "--brand-cta-bg": config.overrideCtaBg ?? config.colorPrimary,
    "--brand-headline-from":
      config.overrideHeadlineGradFrom ?? config.colorPrimary,
    "--brand-headline-to": config.overrideHeadlineGradTo ?? config.colorAccent,
    "--brand-filter-active":
      config.overrideFilterActiveBg ?? config.colorPrimary,
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
