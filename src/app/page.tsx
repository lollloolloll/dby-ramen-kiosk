"use client";

import {
  Suspense,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PromotionSlider } from "@/components/PromotionSlider";
import { processAndMutateExpiredRentals } from "@/lib/actions/rental";
import { useTheme } from "@/components/theme/ThemeProvider";
import { usePreviewMode } from "@/lib/hooks/usePreviewMode";
import { AuroraBackground } from "@/components/visuals/AuroraBackground";
import {
  ParticleWaveBackground,
  type WaveMode,
} from "@/components/visuals/ParticleWaveBackground";
import { resolveVisualMode, resolveWaveMode } from "@/lib/theme/visual-mode";

interface PromotionItem {
  id: string;
  type: "video" | "image" | "url" | "pdf";
  url: string;
  title?: string;
}

interface VideoUrl {
  type: "url";
  name: string;
  url: string;
}

function getFileType(fileName: string): "video" | "image" | "pdf" {
  const ext = fileName.toLowerCase().split(".").pop();
  const videoExts = ["mp4", "webm", "mov", "avi", "mkv"];
  if (ext === "pdf") return "pdf";
  if (videoExts.includes(ext || "")) return "video";
  return "image";
}

const FLOOR = process.env.NEXT_PUBLIC_FLOOR;

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const config = useTheme();
  const isPreview = usePreviewMode();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPromotion, setShowPromotion] = useState(false);
  const [hasShownInitialPromotion, setHasShownInitialPromotion] =
    useState(false);
  const [promotionItems, setPromotionItems] = useState<PromotionItem[]>([]);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasCheckedKioskFlag = useRef(false);

  const visualMode = resolveVisualMode(config, searchParams, "lava");
  const waveMode: WaveMode = resolveWaveMode(searchParams);

  // 프로모션 파일 fetch — 기능 보존
  useEffect(() => {
    const fetchPromotionFiles = async () => {
      try {
        const response = await fetch("/api/uploads/promotion");
        if (!response.ok) return;
        const data = await response.json();
        const fileItems: PromotionItem[] = (data.files || []).map(
          (fileName: string, index: number) => ({
            id: `file-${index}-${fileName}`,
            type: getFileType(fileName),
            url: `/uploads/promotion/${fileName}`,
            title: fileName,
          })
        );
        const urlItems: PromotionItem[] = (data.urls || []).map(
          (urlData: VideoUrl, index: number) => ({
            id: `url-${index}-${urlData.name}`,
            type: "url",
            url: urlData.url,
            title: urlData.name,
          })
        );
        setPromotionItems([...fileItems, ...urlItems]);
      } catch (error) {
        console.error("Error fetching promotion files:", error);
      }
    };
    fetchPromotionFiles();
  }, []);

  // kiosk 복귀 후 프로모션 재노출 플래그 처리 — 기능 보존
  useEffect(() => {
    if (isPreview) {
      hasCheckedKioskFlag.current = true;
      return;
    }
    if (hasCheckedKioskFlag.current || promotionItems.length === 0) return;
    const promotionFlag = sessionStorage.getItem("showPromotionOnHome");
    if (!promotionFlag) {
      hasCheckedKioskFlag.current = true;
      return;
    }
    try {
      const payload = JSON.parse(promotionFlag);
      const now = Date.now();
      if (
        payload.show &&
        payload.timestamp &&
        now - payload.timestamp < payload.ttl
      ) {
        sessionStorage.removeItem("showPromotionOnHome");
        setShowPromotion(true);
      } else {
        sessionStorage.removeItem("showPromotionOnHome");
      }
    } catch (error) {
      console.error("Invalid promotion flag format:", error);
      sessionStorage.removeItem("showPromotionOnHome");
    }
    hasCheckedKioskFlag.current = true;
  }, [isPreview, promotionItems]);

  const resetInactivityTimer = useCallback(() => {
    if (isPreview) return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (!showPromotion) {
      inactivityTimerRef.current = setTimeout(() => {
        setShowPromotion(true);
      }, config.inactivityTimeoutMs);
    }
  }, [config.inactivityTimeoutMs, isPreview, showPromotion]);

  useEffect(() => {
    if (isPreview) return;
    const handleActivity = () => {
      if (showPromotion) return;
      resetInactivityTimer();
    };
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ] as const;
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });
    if (!sessionStorage.getItem("showPromotionOnHome")) {
      inactivityTimerRef.current = setTimeout(() => {
        setShowPromotion(true);
      }, config.inactivityTimeoutMs);
    }
    if (
      promotionItems.length > 0 &&
      !hasShownInitialPromotion &&
      !sessionStorage.getItem("showPromotionOnHome")
    ) {
      const hasSeenPromotion = sessionStorage.getItem("hasSeenInitialPromotion");
      if (!hasSeenPromotion) {
        setShowPromotion(true);
        setHasShownInitialPromotion(true);
        sessionStorage.setItem("hasSeenInitialPromotion", "true");
      }
    }
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [
    config.inactivityTimeoutMs,
    hasShownInitialPromotion,
    isPreview,
    promotionItems.length,
    resetInactivityTimer,
    showPromotion,
  ]);

  const handleClosePromotion = () => {
    setShowPromotion(false);
    if (isPreview) return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      setShowPromotion(true);
    }, config.inactivityTimeoutMs);
  };

  const handleLazyCheck = useCallback(async () => {
    if (isPreview) return;
    await processAndMutateExpiredRentals();
  }, [isPreview]);

  const handleStart = () => {
    if (isPreview) return;
    if (showPromotion) return;
    router.refresh();
    router.push("/kiosk");
  };

  const stopBubble = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <>
      <main
        className="relative flex min-h-screen w-full flex-col overflow-hidden bg-(--brand-bg) text-(--brand-text) selection:bg-(--brand-primary-20)"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <ThemeBackground
          backgroundPath={config.backgroundPath}
          backgroundType={config.backgroundType}
        />

        {visualMode === "aurora" && (
          <AuroraBackground
            colorCore={config.colorPrimary}
            colorFringe={config.colorAccent}
            className="pointer-events-none absolute inset-0 z-0 opacity-90"
            interactive
            paused={isPreview}
          />
        )}

        {visualMode === "wave" && (
          <ParticleWaveBackground
            color={config.colorPrimary}
            mode={waveMode}
            className="pointer-events-none absolute inset-0 z-0"
            paused={isPreview}
          />
        )}

        {visualMode === "lava" && (
          <div className="pointer-events-none absolute inset-0 z-0">
            <div
              className="absolute -left-[10%] -top-[10%] h-[60vw] w-[60vw] rounded-full blur-[140px]"
              style={{ backgroundColor: "var(--brand-primary-20)" }}
            />
            <div
              className="absolute -bottom-[10%] -right-[10%] h-[60vw] w-[60vw] rounded-full blur-[160px]"
              style={{ backgroundColor: "var(--brand-accent-20)" }}
            />
          </div>
        )}

        {/* 미세 그레인 노이즈 — atmosphere */}
        <NoiseOverlay />

        {/* ── 헤더 ────────────────────────────────────────── */}
        <header className="relative z-20 flex items-start justify-between px-8 pt-8 sm:px-12 sm:pt-10">
          <div className="flex items-center gap-4 animate-in fade-in slide-in-from-top-2 fill-mode-backwards duration-700">
            {config.logoPath ? (
              <img
                src={config.logoPath}
                alt={config.orgName}
                className="h-9 w-auto sm:h-11"
              />
            ) : (
              <span
                className="text-base font-semibold tracking-tight sm:text-lg"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {config.orgName || "키오스크"}
              </span>
            )}
            {FLOOR && (
              <div className="flex items-center gap-2 border-l border-(--brand-text)/15 pl-4 text-[11px] uppercase tracking-[0.18em] text-(--brand-muted) sm:text-xs">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--brand-primary) shadow-[0_0_0_3px_var(--brand-primary-20)]" />
                Floor {FLOOR}
              </div>
            )}
          </div>

          <nav className="flex items-center gap-5 text-[11px] uppercase tracking-[0.18em] text-(--brand-muted) sm:text-xs animate-in fade-in slide-in-from-top-2 fill-mode-backwards duration-700 delay-100">
            <button
              type="button"
              className="transition-colors hover:text-(--brand-text)"
              onClick={async (event) => {
                event.stopPropagation();
                if (isPreview) return;
                try {
                  if (!document.fullscreenElement) {
                    await document.documentElement.requestFullscreen();
                  }
                } catch (error) {
                  console.error("Fullscreen request failed:", error);
                }
              }}
            >
              전체화면
            </button>
            <Link
              href="/admin"
              prefetch={false}
              onClick={stopBubble}
              className="transition-colors hover:text-(--brand-text)"
            >
              관리자
            </Link>
          </nav>
        </header>

        {/* ── 본문 ────────────────────────────────────────── */}
        <section className="relative z-10 flex flex-1 flex-col justify-end px-8 pb-16 sm:px-12 sm:pb-20">
          <div className="grid w-full grid-cols-1 items-end gap-12 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards duration-1000 delay-200">
              {(config.homeBadge1.trim() || config.homeBadge2.trim()) && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-(--brand-muted)">
                  {config.homeBadge1.trim() && <span>{config.homeBadge1}</span>}
                  {config.homeBadge1.trim() && config.homeBadge2.trim() && (
                    <span className="text-(--brand-text)/20">/</span>
                  )}
                  {config.homeBadge2.trim() && <span>{config.homeBadge2}</span>}
                </div>
              )}

              <h1
                className="text-[clamp(3.5rem,12vw,9rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-(--brand-text)"
                style={{
                  fontFamily: "var(--font-display)",
                  fontVariationSettings: '"opsz" 96',
                }}
              >
                {config.homeHeadlineTop}
                {config.homeHeadlineBottom && (
                  <>
                    <br />
                    <span className="text-(--brand-primary)">
                      {config.homeHeadlineBottom}
                    </span>
                  </>
                )}
              </h1>

              {(config.orgName.trim() || config.homeSubcopy.trim()) && (
                <p className="max-w-xl text-lg text-(--brand-muted) sm:text-xl">
                  {config.orgName.trim() && (
                    <span className="font-medium text-(--brand-text)">
                      {config.orgName}
                    </span>
                  )}
                  {config.homeSubcopy}
                </p>
              )}
            </div>

            <div className="flex flex-col items-stretch gap-8 lg:items-end animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards duration-1000 delay-300">
              <LiveClock />
              <button
                type="button"
                onClick={handleStart}
                className="group relative inline-flex w-full items-center justify-between gap-6 overflow-hidden rounded-none border border-(--brand-text)/20 bg-(--brand-text) px-7 py-6 text-left text-(--brand-bg) transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-12px_var(--brand-primary-40)] active:translate-y-0 lg:w-[18rem]"
              >
                <span className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.24em] text-(--brand-bg)/60">
                    Start
                  </span>
                  <span
                    className="text-2xl font-semibold tracking-tight"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {config.homeCtaLabel}
                  </span>
                </span>
                <Arrow />
              </button>
            </div>
          </div>
        </section>

        {/* 푸터 — sys info */}
        <footer className="relative z-10 flex items-center justify-between border-t border-(--brand-text)/8 px-8 py-4 text-[10px] uppercase tracking-[0.2em] text-(--brand-muted)/70 sm:px-12">
          <span>{config.orgName || "Kiosk"} · Lounge</span>
          <span className="font-mono normal-case tracking-normal">
            v{FLOOR ? `F${FLOOR}` : "—"}
          </span>
        </footer>
      </main>

      {!isPreview && showPromotion && promotionItems.length > 0 && (
        <PromotionSlider
          items={promotionItems}
          onClose={handleClosePromotion}
          autoPlay
          autoPlayInterval={15000}
          onLazyCheck={handleLazyCheck}
        />
      )}
    </>
  );
}

function ThemeBackground({
  backgroundPath,
  backgroundType,
}: {
  backgroundPath: string | null;
  backgroundType: "image" | "video" | null;
}) {
  if (!backgroundPath) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      {backgroundType === "video" ? (
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={backgroundPath} />
        </video>
      ) : (
        <img
          src={backgroundPath}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div
        className="absolute inset-0 bg-black"
        style={{ opacity: "var(--bg-overlay-opacity)" }}
      />
    </div>
  );
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return <div className="h-[5.5rem]" aria-hidden />;
  }

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div className="flex flex-col gap-1 lg:items-end" aria-hidden>
      <div
        className="font-mono text-5xl font-light tracking-tight text-(--brand-text) tabular-nums sm:text-6xl"
        style={{ fontVariationSettings: '"opsz" 72' }}
      >
        {hh}
        <span className="mx-0.5 animate-pulse text-(--brand-muted)">:</span>
        {mm}
      </div>
      <div className="text-[11px] uppercase tracking-[0.2em] text-(--brand-muted)">
        {dateStr}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg
      width="32"
      height="16"
      viewBox="0 0 32 16"
      fill="none"
      className="shrink-0 transition-transform duration-500 group-hover:translate-x-1"
      aria-hidden
    >
      <path
        d="M0 8H30M30 8L23 1M30 8L23 15"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** SVG 노이즈 — 단색 배경에 미세 grain. opacity 매우 낮음. */
function NoiseOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1] opacity-[0.04] mix-blend-overlay"
      aria-hidden
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }}
    />
  );
}
