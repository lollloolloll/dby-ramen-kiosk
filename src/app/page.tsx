"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Heart, Sparkle } from "lucide-react";
import { PromotionSlider } from "@/components/PromotionSlider";
import { processAndMutateExpiredRentals } from "@/lib/actions/rental";
import { useTheme } from "@/components/theme/ThemeProvider";
import { usePreviewMode } from "@/lib/hooks/usePreviewMode";
import { hasBackgroundMedia } from "@/lib/theme/theme-utils";
import { AuroraBackground } from "@/components/visuals/AuroraBackground";
import {
  ParticleWaveBackground,
  type WaveMode,
} from "@/components/visuals/ParticleWaveBackground";
import type { MarqueeItem } from "@/lib/schemas/siteConfig";

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

export default function Home() {
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

  const hasBackground = hasBackgroundMedia(config.backgroundPath);
  // ?bg=aurora | wave | lava (default). 배경 이미지/영상이 있으면 무조건 none
  const bgParam = searchParams?.get("bg");
  const visualMode: "aurora" | "wave" | "lava" | "none" = hasBackground
    ? "none"
    : bgParam === "aurora"
      ? "aurora"
      : bgParam === "wave"
        ? "wave"
        : config.showLavaLamp
          ? "lava"
          : "none";
  const waveMode: WaveMode =
    (searchParams?.get("waveMode") as WaveMode) || "wave";

  useEffect(() => {
    const fetchPromotionFiles = async () => {
      try {
        const response = await fetch("/api/uploads/promotion");

        if (!response.ok) {
          return;
        }

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

    if (hasCheckedKioskFlag.current || promotionItems.length === 0) {
      return;
    }

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
    if (isPreview) {
      return;
    }

    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    if (!showPromotion) {
      inactivityTimerRef.current = setTimeout(() => {
        setShowPromotion(true);
      }, config.inactivityTimeoutMs);
    }
  }, [config.inactivityTimeoutMs, isPreview, showPromotion]);

  useEffect(() => {
    if (isPreview) {
      return;
    }

    const handleActivity = () => {
      if (showPromotion) {
        return;
      }

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

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
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

    if (isPreview) {
      return;
    }

    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    inactivityTimerRef.current = setTimeout(() => {
      setShowPromotion(true);
    }, config.inactivityTimeoutMs);
  };

  const handleLazyCheck = useCallback(async () => {
    if (isPreview) {
      return;
    }

    await processAndMutateExpiredRentals();
  }, [isPreview]);

  const handleBackgroundClick = () => {
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
      <div
        onClick={handleBackgroundClick}
        className="relative flex min-h-screen w-full cursor-pointer flex-col items-center justify-center overflow-hidden bg-slate-50 font-sans text-brand-text selection:bg-brand-primary/20"
      >
        <ThemeBackground
          backgroundPath={config.backgroundPath}
          backgroundType={config.backgroundType}
        />

        {visualMode === "lava" && (
          <div className="absolute inset-0 z-0 overflow-hidden">
            <div
              className="absolute left-[-10%] top-[-10%] h-[50vw] w-[50vw] rounded-full blur-[100px] animate-pulse"
              style={{
                backgroundColor: "var(--brand-primary-20)",
                animationDuration: "8s",
              }}
            />
            <div
              className="absolute bottom-[-10%] right-[-10%] h-[60vw] w-[60vw] rounded-full blur-[120px] animate-pulse"
              style={{
                backgroundColor: "var(--brand-accent-20)",
                animationDuration: "10s",
                animationDelay: "1s",
              }}
            />
            <div
              className="absolute left-[30%] top-[40%] h-[40vw] w-[40vw] rounded-full blur-[80px] animate-pulse"
              style={{
                backgroundColor: "var(--brand-primary-15)",
                animationDuration: "12s",
                animationDelay: "2s",
              }}
            />
          </div>
        )}

        {visualMode === "aurora" && (
          <AuroraBackground
            colorCore={config.colorPrimary}
            colorFringe={config.colorAccent}
            className="absolute inset-0 z-0"
            interactive
            paused={isPreview}
          />
        )}

        {visualMode === "wave" && (
          <ParticleWaveBackground
            color={config.colorPrimary}
            mode={waveMode}
            className="absolute inset-0 z-0"
            paused={isPreview}
          />
        )}

        <Link
          href="/admin"
          prefetch={false}
          onClick={stopBubble}
          className="absolute right-6 top-6 z-20 text-sm text-muted-foreground transition-colors hover:text-brand-primary"
        >
          관리자
        </Link>

        <p
          className="absolute right-20 top-6 z-20 cursor-pointer text-sm text-muted-foreground transition-colors hover:text-brand-primary"
          onClick={async (event) => {
            event.stopPropagation();
            if (isPreview) {
              return;
            }

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
        </p>

        {config.showStickers &&
          config.stickerEmojis.map((sticker, index) => (
            <FloatingSticker
              key={`${sticker.emoji}-${index}`}
              emoji={sticker.emoji}
              className={STICKER_POSITIONS[index] ?? STICKER_POSITIONS[0]}
              delay={STICKER_DELAYS[index] ?? "0s"}
            />
          ))}

        <div className="relative z-10 flex flex-col items-center space-y-10 px-4 text-center">
          <div className="space-y-6 animate-in fade-in zoom-in slide-in-from-bottom-10 duration-700">
            {config.logoPath ? (
              <div className="mb-6 flex justify-center">
                <img
                  src={config.logoPath}
                  alt={config.orgName}
                  className="max-h-24 w-auto rounded-2xl bg-white/60 p-3 shadow-sm backdrop-blur-sm"
                />
              </div>
            ) : null}

            <div className="mb-4 inline-flex items-center justify-center rounded-full border border-white/50 bg-white/60 px-3 py-1.5 shadow-sm backdrop-blur-sm">
              <span className="flex items-center gap-1 text-sm font-bold text-slate-500">
                <Sparkle
                  className="h-4 w-4"
                  style={{ color: "var(--brand-primary)" }}
                />
                {config.homeBadge1}
              </span>
            </div>

            <div className="mb-4 ml-4 inline-flex items-center justify-center rounded-full border border-white/50 bg-white/60 px-3 py-1.5 shadow-sm backdrop-blur-sm">
              <span className="flex items-center gap-1 text-sm font-bold text-slate-500">
                <Heart
                  className="h-4 w-4"
                  style={{ color: "var(--brand-primary)" }}
                />
                {config.homeBadge2}
              </span>
            </div>

            <h1 className="text-6xl font-black leading-[1.1] tracking-tighter text-slate-800 drop-shadow-sm md:text-8xl">
              {config.homeHeadlineTop}
              <br />
              <span
                className="text-transparent"
                style={{
                  backgroundClip: "text",
                  WebkitBackgroundClip: "text",
                  backgroundImage:
                    "linear-gradient(to right, var(--brand-headline-from), var(--brand-headline-to))",
                }}
              >
                {config.homeHeadlineBottom}
              </span>
            </h1>

            <p className="text-xl font-medium text-slate-500 md:text-2xl">
              <span
                className="font-bold"
                style={{ color: "var(--brand-accent)" }}
              >
                {config.orgName}
              </span>
              {config.homeSubcopy}
            </p>
          </div>

          <p className="animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards pt-4 text-base font-semibold text-slate-500 duration-1000 delay-300 md:text-lg">
            화면 아무 곳이나 터치하세요
          </p>
        </div>

        {config.showMarquee && (
          <div className="absolute bottom-10 w-full -rotate-1 overflow-hidden border-y border-white/20 bg-white/30 py-3 shadow-sm backdrop-blur-md">
            <div className="flex animate-marquee whitespace-nowrap">
              <MarqueeText items={config.marqueeItems} />
              <MarqueeText items={config.marqueeItems} />
              <MarqueeText items={config.marqueeItems} />
              <MarqueeText items={config.marqueeItems} />
            </div>
          </div>
        )}
      </div>

      {!isPreview && showPromotion && promotionItems.length > 0 && (
        <PromotionSlider
          items={promotionItems}
          onClose={handleClosePromotion}
          autoPlay
          autoPlayInterval={15000}
          onLazyCheck={handleLazyCheck}
        />
      )}

      <style jsx global>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-100%);
          }
        }
        .animate-marquee {
          animation: marquee 20s linear infinite;
        }
      `}</style>
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
  if (!backgroundPath) {
    return null;
  }

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

function FloatingSticker({
  emoji,
  className,
  delay,
}: {
  emoji: string;
  className: string;
  delay: string;
}) {
  return (
    <div
      className={`absolute flex h-20 w-20 cursor-default select-none items-center justify-center rounded-2xl border-4 border-white bg-white shadow-[0_8px_20px_rgba(0,0,0,0.1)] transition-transform duration-300 hover:scale-110 animate-bounce md:h-24 md:w-24 ${className}`}
      style={{ animationDuration: "3s", animationDelay: delay }}
    >
      <span className="text-5xl drop-shadow-sm filter md:text-6xl">{emoji}</span>
    </div>
  );
}

function MarqueeText({ items }: { items: MarqueeItem[] }) {
  return (
    <span className="mx-4 flex items-center gap-8 text-lg font-bold text-slate-500/80">
      {items.map((item, index) => (
        <span key={`${item.emoji}-${item.label}-${index}`} className="flex items-center gap-8">
          <span>
            {item.emoji} {item.label}
          </span>
          <span
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor:
                index % 2 === 0 ? "var(--brand-primary)" : "var(--brand-accent)",
            }}
          />
        </span>
      ))}
    </span>
  );
}

const STICKER_POSITIONS = [
  "top-[15%] left-[10%] -rotate-12",
  "top-[20%] right-[12%] rotate-12",
  "bottom-[25%] left-[15%] rotate-6",
  "bottom-[20%] right-[10%] -rotate-6",
];

const STICKER_DELAYS = ["0s", "1.5s", "0.5s", "2s"];
