"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PromotionSlider } from "@/components/PromotionSlider";
import defaultLogo from "@/assets/images/default-logo.png";
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

  // 프로모션 fetch (기능 보존)
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
      const hasSeenPromotion = sessionStorage.getItem(
        "hasSeenInitialPromotion"
      );
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
      {/* Hero band — 색은 var(--brand-text) / var(--brand-bg). 운영자가 ThemeBuilder에서 직접 제어 */}
      <main
        onClick={handleStart}
        className="home-shell relative flex min-h-[100dvh] w-full cursor-pointer flex-col overflow-hidden bg-(--brand-bg) text-(--brand-text) selection:bg-(--brand-primary)/30"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {/* 배경 미디어가 있으면 chrome 위에 */}
        <ThemeBackground
          backgroundPath={config.backgroundPath}
          backgroundType={config.backgroundType}
        />

        {/* visual preset — aurora/wave/lava 셰이더 배경 */}
        {visualMode === "aurora" && (
          <AuroraBackground
            colorCore={config.colorPrimary}
            colorFringe={config.colorAccent}
            className="pointer-events-none absolute inset-0 z-0 opacity-70"
            paused={isPreview}
          />
        )}
        {visualMode === "wave" && (
          <ParticleWaveBackground
            color={config.colorPrimary}
            mode={waveMode}
            className="pointer-events-none absolute inset-0 z-0 opacity-70"
            paused={isPreview}
          />
        )}
        {visualMode === "lava" && (
          <div className="pointer-events-none absolute inset-0 z-0">
            <div
              className="absolute -left-[10%] -top-[10%] h-[60vw] w-[60vw] rounded-full blur-[160px] opacity-50"
              style={{ backgroundColor: "var(--brand-primary)" }}
            />
            <div
              className="absolute -bottom-[10%] -right-[10%] h-[60vw] w-[60vw] rounded-full blur-[180px] opacity-40"
              style={{ backgroundColor: "var(--brand-accent)" }}
            />
          </div>
        )}

        {/* ── Primary nav strip (PS-style dark) ───────── */}
        <nav className="home-nav relative z-20 flex h-12 items-center justify-between bg-brand-text px-6 text-(--brand-bg) sm:px-12 animate-in fade-in slide-in-from-top-1 fill-mode-backwards duration-500">
          <div className="flex items-center gap-5">
            {/* 로고: 업로드된 게 없으면 번들 기본 로고(default-logo.png) 사용 */}
            <img
              src={config.logoPath ?? defaultLogo.src}
              alt={config.orgName || "로고"}
              className="home-nav-logo h-7 w-auto"
            />
            {FLOOR && (
              <span className="flex items-center gap-1.5 border-l border-(--brand-bg)/15 pl-5 text-[11px] font-medium uppercase tracking-[0.18em] text-(--brand-bg)/60">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: "var(--brand-primary)",
                    boxShadow:
                      "0 0 0 3px color-mix(in srgb, var(--brand-primary) 25%, transparent)",
                  }}
                />
                Floor {FLOOR}
              </span>
            )}
          </div>
          <div className="flex items-center gap-6 text-[11px] font-medium uppercase tracking-[0.18em] text-(--brand-bg)/60">
            <button
              type="button"
              className="transition-colors hover:text-(--brand-bg)"
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
              className="transition-colors hover:text-(--brand-bg)"
            >
              관리자
            </Link>
          </div>
        </nav>

        {/* ── Hero band — PS display-xl weight 300 ──── */}
        <section className="home-hero relative z-10 flex flex-1 flex-col justify-center px-6 py-24 sm:px-12 sm:py-32 md:px-20 xl:px-12">
          <div className="home-hero-grid mx-auto grid w-full max-w-[1280px] grid-cols-1 items-end gap-16 lg:grid-cols-[1.3fr_1fr] lg:gap-24">
            <div className="home-copy flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards duration-700 delay-100">
              <div className="home-copy-content flex max-w-[760px] flex-col items-start gap-8">
                {(config.homeBadge1.trim() || config.homeBadge2.trim()) && (
                  <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.24em] text-(--body-muted)">
                    {config.homeBadge1.trim() && (
                      <span>{config.homeBadge1}</span>
                    )}
                    {config.homeBadge1.trim() && config.homeBadge2.trim() && (
                      <span className="text-(--brand-text)/20">·</span>
                    )}
                    {config.homeBadge2.trim() && (
                      <span>{config.homeBadge2}</span>
                    )}
                  </div>
                )}

                {/* PS display-xl: weight 300, tight tracking */}
                <h1
                  className="home-headline font-light leading-[1.05] tracking-[-0.02em]"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "clamp(3rem, 9vw, 6.5rem)",
                    fontWeight: 700,
                  }}
                >
                  <span className="home-headline-line xl:-ml-[15px]">
                    {config.homeHeadlineTop}
                  </span>
                  {config.homeHeadlineBottom && (
                    <span
                      className="home-headline-line xl:-ml-[15px]"
                      style={{ color: "var(--brand-primary)" }}
                    >
                      {config.homeHeadlineBottom}
                    </span>
                  )}
                </h1>

                {(config.orgName.trim() || config.homeSubcopy.trim()) && (
                  <p className="home-subcopy max-w-xl text-lg leading-relaxed text-(--body-muted) sm:text-xl">
                    {config.orgName.trim() && (
                      <span className="font-medium text-(--brand-text)">
                        {config.orgName}
                      </span>
                    )}
                    {config.homeSubcopy}
                  </p>
                )}

                {/* 화면 어디든 탭하면 키오스크로 진입 — 별도 CTA 없음 */}
                <div className="home-start-hint mt-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.22em] text-(--body-muted)">
                  <span
                    className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                    style={{ backgroundColor: "var(--brand-primary)" }}
                  />
                  <span>화면을 터치하여 시작</span>
                </div>
              </div>
            </div>

            {/* Right slot: live clock + status (editorial moment) */}
            <div className="home-clock-panel flex flex-col items-start gap-6 lg:items-end animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards duration-700 delay-200">
              <LiveClock />
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-(--body-muted)">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: "var(--brand-primary)" }}
                />
                Online
              </div>
            </div>
          </div>
        </section>

        {/* ── BRAND BAND footer (PS-style blue strip) ─ */}
        <footer
          className="home-footer relative z-10 px-6 py-6 sm:px-12"
          style={{
            backgroundColor: "var(--brand-primary)",
            color: "var(--brand-on-primary)",
          }}
        >
          <div className="mx-auto flex max-w-[1280px] items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em]">
            <span>{config.orgName || "Kiosk"} · Lounge</span>
            <span className="font-mono text-[10px] normal-case tracking-normal opacity-70">
              {FLOOR ? `F${FLOOR}` : "—"}
            </span>
          </div>
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
      {/* 음영 오버레이는 이미지 배경에만 적용 (동영상은 원본 그대로) */}
      {backgroundType !== "video" && (
        <div
          className="absolute inset-0 bg-(--brand-text)"
          style={{ opacity: "var(--bg-overlay-opacity)" }}
        />
      )}
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

  if (!now) return <div className="h-[5rem]" aria-hidden />;

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
        className="home-clock-time font-mono text-5xl font-light tabular-nums tracking-tight text-(--brand-text) sm:text-6xl"
        style={{ fontVariationSettings: '"wght" 300' }}
      >
        {hh}
        <span className="mx-0.5 animate-pulse text-(--brand-text)/40">:</span>
        {mm}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-(--body-muted)">
        {dateStr}
      </div>
    </div>
  );
}
