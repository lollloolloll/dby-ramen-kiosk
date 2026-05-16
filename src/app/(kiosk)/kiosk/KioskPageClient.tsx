"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Home } from "lucide-react";
import { PromotionSlider } from "@/components/PromotionSlider";
import { ItemCard } from "@/components/item/ItemCard";
import { RentalDialog } from "@/components/item/RentalDialog";
import { useTheme } from "@/components/theme/ThemeProvider";
import { usePreviewMode } from "@/lib/hooks/usePreviewMode";
import { processAndMutateExpiredRentals } from "@/lib/actions/rental";
import { cn } from "@/lib/utils";
import { getGridColsClass, hasBackgroundMedia } from "@/lib/theme/theme-utils";
import { AuroraBackground } from "@/components/visuals/AuroraBackground";
import {
  ParticleWaveBackground,
  type WaveMode,
} from "@/components/visuals/ParticleWaveBackground";
import { resolveVisualMode, resolveWaveMode } from "@/lib/theme/visual-mode";
import type { Item } from "@/app/(admin)/admin/items/columns";

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

  const hasBackground = hasBackgroundMedia(config.backgroundPath);
  // 키오스크는 lava lamp 대신 그라데이션이라 fallback이 'gradient' 의미로 'lava' 슬롯 재활용
  const visualMode = resolveVisualMode(config, searchParams, "lava");
  const waveMode: WaveMode = resolveWaveMode(searchParams);
  const effectiveShowKioskGradient =
    visualMode === "lava" && config.showKioskBgGradient && !hasBackground;

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
      <div className="relative min-h-screen overflow-hidden">
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
          className={cn(
            "relative min-h-screen",
            effectiveShowKioskGradient &&
              "bg-linear-to-br from-(--brand-primary-15) via-(--brand-accent-15) to-(--brand-accent-15)"
          )}
        >
          <div className="container relative z-10 mx-auto px-6 py-10">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4 lg:flex-nowrap lg:gap-6">
              <Link
                href="/"
                onClick={(event) => {
                  if (isPreview) {
                    event.preventDefault();
                  }
                }}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl border-2 bg-white/80 px-4 py-2 shadow-lg transition-all duration-300 hover:scale-105 hover:bg-white hover:shadow-xl group sm:px-6 sm:py-3"
                style={{
                  borderColor: "var(--brand-primary-30)",
                }}
              >
                <Home
                  className="h-5 w-5 transition-transform duration-300 group-hover:scale-110"
                  style={{ color: "var(--brand-primary)" }}
                />
                <span
                  className="text-base font-bold sm:text-lg"
                  style={{ color: "var(--brand-primary)" }}
                >
                  홈으로
                </span>
              </Link>

              <h1
                className="order-last w-full min-w-0 truncate text-center text-3xl font-black md:text-4xl lg:order-none lg:flex-1 lg:text-5xl"
                style={{ color: "var(--brand-primary)" }}
              >
                {config.kioskTitle}
              </h1>

              {config.showFilters && (
                <div className="flex max-w-full shrink-0 items-center gap-2 overflow-x-auto scrollbar-hidden sm:gap-3">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => handleCategoryChange(category)}
                      className={cn(
                        "shrink-0 whitespace-nowrap rounded-2xl px-4 py-2 font-bold shadow-lg transition-all duration-300 hover:scale-105 sm:px-6 sm:py-3",
                        selectedCategory === category
                          ? "border-2 text-white"
                          : "border-2 bg-white/80 hover:bg-white"
                      )}
                      style={
                        selectedCategory === category
                          ? {
                              backgroundColor: "var(--brand-filter-active)",
                              borderColor: "var(--brand-filter-active)",
                            }
                          : {
                              color: "var(--brand-primary)",
                              borderColor: "var(--brand-primary-30)",
                            }
                      }
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="container relative z-10 mx-auto min-h-0 flex-1 px-6 pb-10">
            {filteredItems.length > 0 ? (
              <div
                className={cn(
                  "grid gap-6 auto-rows-fr",
                  getGridColsClass(config.kioskGridCols)
                )}
              >
                {filteredItems.map((item) => (
                  <div key={item.id} className="h-full w-full">
                    <ItemCard item={item} onOrder={handleOrder} />
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="flex h-full items-center justify-center rounded-2xl border-2 bg-card shadow-lg"
                style={{ borderColor: "var(--brand-primary-20)" }}
              >
                <div className="text-center">
                  <p
                    className="mb-2 text-3xl font-bold"
                    style={{ color: "var(--brand-primary)" }}
                  >
                    {selectedCategory === "전체"
                      ? config.kioskEmptyTitle
                      : `${selectedCategory} 카테고리에 대여가능한 상품이 없습니다.`}
                  </p>
                  <p className="text-lg text-muted-foreground">
                    {selectedCategory === "전체"
                      ? config.kioskEmptySubtitle
                      : "다른 카테고리를 선택해주세요."}
                  </p>
                </div>
              </div>
            )}
          </div>

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
