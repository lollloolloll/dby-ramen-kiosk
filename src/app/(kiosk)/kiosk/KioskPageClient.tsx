"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PromotionSlider } from "@/components/PromotionSlider";
import { ItemCard } from "@/components/item/ItemCard";
import { RentalDialog } from "@/components/item/RentalDialog";
import { useTheme } from "@/components/theme/ThemeProvider";
import { usePreviewMode } from "@/lib/hooks/usePreviewMode";
import { processAndMutateExpiredRentals } from "@/lib/actions/rental";
import { cn } from "@/lib/utils";
import { getGridColsClass } from "@/lib/theme/theme-utils";
import { AuroraBackground } from "@/components/visuals/AuroraBackground";
import {
  ParticleWaveBackground,
  type WaveMode,
} from "@/components/visuals/ParticleWaveBackground";
import { resolveVisualMode, resolveWaveMode } from "@/lib/theme/visual-mode";
import type { Item } from "@/app/(admin)/admin/items/columns";

const FLOOR = process.env.NEXT_PUBLIC_FLOOR;

interface KioskPageClientProps {
  items: Item[];
  consentFile: { url: string; type: "pdf" | "image" | "doc" } | null;
  schoolReconfirmMode: boolean;
}

interface PromotionItem {
  id: string;
  type: "video" | "image";
  url: string;
  title?: string;
}

function getFileType(fileName: string): "video" | "image" {
  const ext = fileName.toLowerCase().split(".").pop();
  const videoExts = ["mp4", "webm", "mov", "avi", "mkv"];
  return videoExts.includes(ext || "") ? "video" : "image";
}

export function KioskPageClient({
  items,
  consentFile,
  schoolReconfirmMode,
}: KioskPageClientProps) {
  const config = useTheme();
  const isPreview = usePreviewMode();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showPromotion, setShowPromotion] = useState(false);
  const [promotionItems, setPromotionItems] = useState<PromotionItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const visualMode = resolveVisualMode(config, searchParams, "lava");
  const waveMode: WaveMode = resolveWaveMode(searchParams);

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(items.map((item) => item.category))
    );
    return ["전체", ...uniqueCategories.sort()];
  }, [items]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === "전체") {
      return items;
    }

    return items.filter((item) => item.category === selectedCategory);
  }, [items, selectedCategory]);

  useEffect(() => {
    if (isPreview) {
      return;
    }

    router.refresh();
  }, [isPreview, router]);

  useEffect(() => {
    const fetchPromotionFiles = async () => {
      try {
        const response = await fetch("/api/uploads/promotion");

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const nextItems: PromotionItem[] = (data.files || []).map(
          (fileName: string, index: number) => ({
            id: `promo-${index}-${fileName}`,
            type: getFileType(fileName),
            url: `/uploads/promotion/${fileName}`,
            title: fileName,
          })
        );

        setPromotionItems(nextItems);
      } catch (error) {
        console.error("Error fetching promotion files:", error);
      }
    };

    fetchPromotionFiles();
  }, []);

  const resetInactivityTimer = () => {
    if (isPreview) {
      return;
    }

    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    if (isDialogOpen) {
      return;
    }

    inactivityTimerRef.current = setTimeout(() => {
      const promotionPayload = {
        show: true,
        timestamp: Date.now(),
        ttl: 5000,
      };

      sessionStorage.setItem(
        "showPromotionOnHome",
        JSON.stringify(promotionPayload)
      );
      router.push("/");
    }, config.inactivityTimeoutMs);
  };

  useEffect(() => {
    if (isPreview) {
      return;
    }

    const handleActivity = () => {
      if (showPromotion || isDialogOpen) {
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

    resetInactivityTimer();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [config.inactivityTimeoutMs, isDialogOpen, isPreview, showPromotion]);

  useEffect(() => {
    if (isPreview) {
      return;
    }

    if (isDialogOpen) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      return;
    }

    if (!showPromotion) {
      resetInactivityTimer();
    }
  }, [isDialogOpen, isPreview, showPromotion]);

  const handleClosePromotion = () => {
    setShowPromotion(false);
    resetInactivityTimer();
  };

  const handleLazyCheck = async () => {
    if (isPreview) {
      return;
    }

    await processAndMutateExpiredRentals();
  };

  const handleOrder = (item: Item) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    resetInactivityTimer();
  };

  return (
    <>
      <div className="relative min-h-screen overflow-hidden bg-(--brand-bg)">
        <ThemeBackground
          backgroundPath={config.backgroundPath}
          backgroundType={config.backgroundType}
        />

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

        <div
          className="relative flex min-h-screen flex-col"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {/* ── 헤더 ───────────────────────────────────────── */}
          <header className="relative z-10 border-b border-(--brand-text)/8 px-8 py-6 sm:px-12 sm:py-8 animate-in fade-in slide-in-from-top-2 fill-mode-backwards duration-700">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
              <div className="flex items-center gap-5">
                <Link
                  href="/"
                  onClick={(event) => {
                    if (isPreview) event.preventDefault();
                  }}
                  className="group inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-(--brand-muted) transition-colors hover:text-(--brand-text)"
                >
                  <ArrowLeft />
                  <span>홈으로</span>
                </Link>
                {FLOOR && (
                  <div className="flex items-center gap-2 border-l border-(--brand-text)/15 pl-5 text-[11px] uppercase tracking-[0.18em] text-(--brand-muted)">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--brand-primary) shadow-[0_0_0_3px_var(--brand-primary-20)]" />
                    Floor {FLOOR}
                  </div>
                )}
              </div>

              <h1
                className="text-[clamp(2rem,6vw,3.5rem)] font-semibold leading-[0.95] tracking-[-0.03em] text-(--brand-text)"
                style={{
                  fontFamily: "var(--font-display)",
                  fontVariationSettings: '"opsz" 48',
                }}
              >
                {config.kioskTitle}
              </h1>

              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-(--brand-muted)/80 lg:justify-end">
                <span>{filteredItems.length}</span>
                <span className="text-(--brand-text)/20">/</span>
                <span>{items.length} items</span>
              </div>
            </div>

            {config.showFilters && categories.length > 1 && (
              <div className="mt-6 flex items-center gap-2 overflow-x-auto scrollbar-hidden">
                {categories.map((category) => {
                  const active = selectedCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => handleCategoryChange(category)}
                      className={cn(
                        "shrink-0 whitespace-nowrap px-4 py-2 text-sm transition-colors",
                        "border",
                        active
                          ? "border-(--brand-text) bg-(--brand-text) text-(--brand-bg)"
                          : "border-(--brand-text)/15 text-(--brand-muted) hover:border-(--brand-text)/40 hover:text-(--brand-text)"
                      )}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            )}
          </header>

          {/* ── 카탈로그 ─────────────────────────────────────── */}
          <main className="relative z-10 flex-1 px-8 py-10 sm:px-12 animate-in fade-in fill-mode-backwards duration-1000 delay-150">
            {filteredItems.length > 0 ? (
              <div
                className={cn(
                  "grid gap-5 auto-rows-fr sm:gap-6",
                  getGridColsClass(config.kioskGridCols)
                )}
              >
                {filteredItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="h-full w-full animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards"
                    style={{
                      animationDelay: `${Math.min(index * 40, 600)}ms`,
                      animationDuration: "500ms",
                    }}
                  >
                    <ItemCard item={item} onOrder={handleOrder} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[60vh] items-center justify-center">
                <div className="max-w-lg text-center">
                  <div className="mb-6 inline-block text-[10px] uppercase tracking-[0.3em] text-(--brand-muted)">
                    Empty
                  </div>
                  <p
                    className="mb-3 text-3xl font-semibold tracking-tight text-(--brand-text) sm:text-4xl"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {selectedCategory === "전체"
                      ? config.kioskEmptyTitle
                      : `${selectedCategory} 카테고리에 대여가능한 상품이 없습니다.`}
                  </p>
                  <p className="text-base text-(--brand-muted) sm:text-lg">
                    {selectedCategory === "전체"
                      ? config.kioskEmptySubtitle
                      : "다른 카테고리를 선택해주세요."}
                  </p>
                </div>
              </div>
            )}
          </main>

          {/* ── 푸터 ─────────────────────────────────────── */}
          <footer className="relative z-10 flex items-center justify-between border-t border-(--brand-text)/8 px-8 py-4 text-[10px] uppercase tracking-[0.2em] text-(--brand-muted)/70 sm:px-12">
            <span>{config.orgName || "Kiosk"} · Catalog</span>
            <span className="font-mono normal-case tracking-normal">
              v{FLOOR ? `F${FLOOR}` : "—"}
            </span>
          </footer>

          <RentalDialog
            item={selectedItem}
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            consentFile={consentFile}
            schoolReconfirmMode={schoolReconfirmMode}
          />
        </div>
      </div>

      {!isPreview && showPromotion && promotionItems.length > 0 && (
        <PromotionSlider
          items={promotionItems}
          onClose={handleClosePromotion}
          autoPlay
          autoPlayInterval={5000}
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

function ArrowLeft() {
  return (
    <svg
      width="20"
      height="10"
      viewBox="0 0 20 10"
      fill="none"
      className="transition-transform duration-300 group-hover:-translate-x-0.5"
      aria-hidden
    >
      <path
        d="M20 5H1M1 5L6 1M1 5L6 9"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
