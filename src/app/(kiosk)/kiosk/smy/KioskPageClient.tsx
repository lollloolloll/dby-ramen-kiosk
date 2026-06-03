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
  const [cart, setCart] = useState<Item[]>([]);
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

  const toggleCart = (item: Item) => {
    setCart((prev) =>
      prev.some((i) => i.id === item.id)
        ? prev.filter((i) => i.id !== item.id)
        : [...prev, item]
    );
    resetInactivityTimer();
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setIsDialogOpen(true);
  };

  const handleCartSuccess = () => {
    setCart([]);
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

        <div
          className="relative flex min-h-screen flex-col"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {/* ── PS-style dark primary nav ─────────────── */}
          <nav className="relative z-20 flex h-12 items-center justify-between bg-brand-text px-6 text-(--brand-bg) sm:px-12 animate-in fade-in slide-in-from-top-1 fill-mode-backwards duration-500">
            <div className="flex items-center gap-5">
              <Link
                href="/"
                onClick={(event) => {
                  if (isPreview) event.preventDefault();
                }}
                className="group inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-(--brand-bg)/70 transition-colors hover:text-(--brand-bg)"
              >
                <ArrowLeft />
                <span>홈으로</span>
              </Link>
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
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-(--brand-bg)/40">
              {config.orgName || "Catalog"}
            </span>
          </nav>

          {/* ── Light canvas utility — PS-style hero band ───── */}
          <header className="relative z-10 border-b border-(--hairline) bg-(--brand-bg) px-6 pt-16 pb-12 sm:px-12 sm:pt-20 sm:pb-14 animate-in fade-in slide-in-from-top-2 fill-mode-backwards duration-700">
            <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.22em] text-(--body-muted)">
                <span>Catalog</span>
                <span>
                  {filteredItems.length}
                  <span className="mx-1.5 text-(--brand-text)/20">/</span>
                  {items.length} items
                </span>
              </div>

              {/* PS display-xl: weight 300, large */}
              <h1
                className="font-light leading-[1.05] tracking-[-0.02em] text-brand-text"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "clamp(2.25rem, 6vw, 3.75rem)",
                  fontWeight: 700,
                }}
              >
                {config.kioskTitle}
              </h1>

              {categories.length > 1 && (
                <div className="mt-2 flex items-center gap-2 overflow-x-auto scrollbar-hidden">
                  {categories.map((category) => {
                    const active = selectedCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => handleCategoryChange(category)}
                        className={cn(
                          "shrink-0 rounded-full px-4 py-2 text-xs font-bold uppercase transition-colors",
                          !active &&
                            "border border-(--hairline-strong) bg-transparent text-(--brand-text)/70 hover:border-(--brand-text)/40 hover:text-brand-text"
                        )}
                        style={
                          active
                            ? {
                                backgroundColor: "var(--brand-primary)",
                                color: "var(--brand-on-primary)",
                                letterSpacing: "0.045em",
                              }
                            : { letterSpacing: "0.045em" }
                        }
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </header>

          {/* ── Catalog grid ────────────────────────────── */}
          <main className="relative z-10 flex-1 bg-(--brand-bg) px-6 py-12 sm:px-12 sm:py-16 animate-in fade-in fill-mode-backwards duration-1000 delay-100">
            <div className="mx-auto max-w-[1280px]">
              {filteredItems.length > 0 ? (
                <div
                  className={cn(
                    "grid gap-4 auto-rows-fr sm:gap-6",
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
                      <ItemCard
                        item={item}
                        onAddToCart={toggleCart}
                        inCart={cart.some((i) => i.id === item.id)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[50vh] items-center justify-center">
                  <div className="max-w-lg text-center">
                    <div className="mb-6 inline-block text-[10px] font-medium uppercase tracking-[0.3em] text-(--body-muted)">
                      Empty
                    </div>
                    <p
                      className="mb-3 font-light leading-tight tracking-tight text-(--brand-text)"
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
                        fontWeight: 600,
                      }}
                    >
                      {selectedCategory === "전체"
                        ? "현재 대여가능한 상품이 없습니다."
                        : `${selectedCategory} 카테고리에 대여가능한 상품이 없습니다.`}
                    </p>
                    <p className="text-base text-(--body-muted) sm:text-lg">
                      {selectedCategory === "전체"
                        ? "관리자에게 문의해주세요."
                        : "다른 카테고리를 선택해주세요."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </main>

          {/* ── PS-style brand footer band ────────────── */}
          <footer
            className="relative z-10 px-6 py-6 sm:px-12"
            style={{
              backgroundColor: "var(--brand-primary)",
              color: "var(--brand-on-primary)",
            }}
          >
            <div className="mx-auto flex max-w-[1280px] items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em]">
              <span>{config.orgName || "Kiosk"} · Catalog</span>
              <span className="font-mono text-[10px] normal-case tracking-normal opacity-70">
                {FLOOR ? `F${FLOOR}` : "—"}
              </span>
            </div>
          </footer>

          <RentalDialog
            item={null}
            cartItems={cart}
            onCartSuccess={handleCartSuccess}
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            consentFile={consentFile}
            schoolReconfirmMode={schoolReconfirmMode}
          />
        </div>

        {/* 하단 플로팅 장바구니 바 */}
        {cart.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-5 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <button
              type="button"
              onClick={handleCheckout}
              className="flex w-full max-w-[1280px] items-center justify-between gap-4 rounded-2xl px-6 py-4 shadow-2xl transition-transform active:scale-[0.99]"
              style={{
                backgroundColor: "var(--brand-primary)",
                color: "var(--brand-on-primary)",
              }}
            >
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-base font-black">
                  {cart.length}
                </span>
                <span className="text-sm font-medium opacity-90">
                  {cart.map((i) => i.name).join(", ")}
                </span>
              </span>
              <span className="shrink-0 text-lg font-bold tracking-tight">
                대여하기 →
              </span>
            </button>
          </div>
        )}
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
