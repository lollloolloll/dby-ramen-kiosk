import type { SiteConfig } from "@/lib/schemas/siteConfig";
import { hasBackgroundMedia } from "@/lib/theme/theme-utils";
import type { WaveMode } from "@/components/visuals/ParticleWaveBackground";

export type VisualMode = "aurora" | "wave" | "lava" | "none";

const VALID_MODES: VisualMode[] = ["aurora", "wave", "lava", "none"];
const VALID_WAVE_MODES: WaveMode[] = [
  "wave",
  "pulse",
  "spiral",
  "noise",
  "interference",
];

/**
 * 비주얼 모드 결정 우선순위:
 * 1. ?bg= 쿼리 파라미터 (개발/시연용 override)
 * 2. config.visualPreset (인스턴스별 seed 값. 추가 예정)
 * 3. config.showLavaLamp 같은 레거시 토글
 * 4. 배경 이미지/영상이 있으면 무조건 none (셰이더가 가림)
 */
export function resolveVisualMode(
  config: SiteConfig,
  searchParams: URLSearchParams | null,
  fallback: VisualMode = "lava"
): VisualMode {
  if (hasBackgroundMedia(config.backgroundPath)) return "none";

  const queryOverride = searchParams?.get("bg");
  if (queryOverride && (VALID_MODES as string[]).includes(queryOverride)) {
    return queryOverride as VisualMode;
  }

  // 추후 추가될 config.visualPreset 컬럼 (현 시점엔 미정의)
  const preset = (config as SiteConfig & { visualPreset?: string }).visualPreset;
  if (preset && (VALID_MODES as string[]).includes(preset)) {
    return preset as VisualMode;
  }

  // 레거시: showLavaLamp 토글이 켜져 있으면 lava
  if (config.showLavaLamp) return "lava";

  return fallback;
}

export function resolveWaveMode(
  searchParams: URLSearchParams | null
): WaveMode {
  const v = searchParams?.get("waveMode");
  if (v && (VALID_WAVE_MODES as string[]).includes(v)) {
    return v as WaveMode;
  }
  return "wave";
}
