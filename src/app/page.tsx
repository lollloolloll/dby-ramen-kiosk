"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, MonitorPlay, Sparkle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PromotionSlider } from "@/components/PromotionSlider";
import { processAndMutateExpiredRentals } from "@/lib/actions/rental";
import { useTheme } from "@/components/theme/ThemeProvider";
import { usePreviewMode } from "@/lib/hooks/usePreviewMode";
import { hasBackgroundMedia } from "@/lib/theme/theme-utils";
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
  const [showPromotion, setShowPromotion] = useState(false);
  const [hasShownInitialPromotion, setHasShownInitialPromotion] =
    useState(false);
  const [promotionItems, setPromotionItems] = useState<PromotionItem[]>([]);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasCheckedKioskFlag = useRef(false);

  const hasBackground = hasBackgroundMedia(config.backgroundPath);
  const effectiveShowLavaLamp = config.showLavaLamp && !hasBackground;

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

  const handleKioskClick = (event: React.MouseEvent) => {
    if (isPreview) {
      event.preventDefault();
      return;
    }

    router.refresh();
  };

  return (
    <>
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-slate-50 font-sans text-brand-text selection:bg-brand-primary/20">
        <ThemeBackground
          backgroundPath={config.backgroundPath}
          backgroundType={config.backgroundType}
        />

        {effectiveShowLavaLamp && (
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

        <Link
          href="/admin"
          prefetch={false}
          className="absolute right-6 top-6 z-20 text-sm text-muted-foreground transition-colors hover:text-brand-primary"
        >
          관리자
        </Link>

        <p
          className="absolute right-20 top-6 z-20 cursor-pointer text-sm text-muted-foreground transition-colors hover:text-brand-primary"
          onClick={async () => {
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

          <div className="animate-in fade-in zoom-in slide-in-from-bottom-10 fill-mode-backwards pt-4 duration-1000 delay-300">
            <Button
              asChild
              className="group relative h-24 overflow-hidden rounded-4xl border-4 border-slate-100 px-12 text-3xl font-black text-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 hover:scale-105 hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] active:scale-95 active:shadow-sm md:text-4xl"
              style={{ backgroundColor: "var(--brand-cta-bg)" }}
            >
              <Link
                href="/kiosk"
                prefetch={false}
                onClick={handleKioskClick}
                className="flex items-center gap-4"
              >
                <div
                  className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, var(--brand-primary-10), var(--brand-accent-10))",
                  }}
                />

                <span
                  className="relative z-10"
                  style={{ color: "var(--brand-text)" }}
                >
                  {config.homeCtaLabel}
                </span>

                <div
                  className="relative z-10 rounded-full p-2 shadow-sm transition-transform duration-300 group-hover:rotate-12"
                  style={{
                    backgroundColor: "var(--brand-text)",
                    color: "white",
                  }}
                >
                  <MonitorPlay
                    className="h-6 w-6 md:h-8 md:w-8"
                    fill="currentColor"
                  />
                </div>
              </Link>
            </Button>
          </div>
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
