"use client";

import { Item } from "@/app/(admin)/admin/items/columns";
import Image from "next/image";
import bearImage from "@/assets/images/bear.png";
import { useTheme } from "@/components/theme/ThemeProvider";

interface ItemCardProps {
  item: Item;
  onOrder: (item: Item) => void;
}

/**
 * PlayStation-style product card (DESIGN.md `game-tile` / `product-card`):
 * - 8px radius (`rounded.md`)
 * - flat, no resting shadow (depth from surface color)
 * - imagery 70%, copy slot bottom 30%
 * - badge-info pill (full rounded) — primary blue, top-right
 * - subtle border (hairline-light)
 */
export function ItemCard({ item, onOrder }: ItemCardProps) {
  const config = useTheme();
  const isRented = item.isTimeLimited ? item.status === "RENTED" : false;
  const waitingCount = item.waitingCount;

  const imageSrc = item.imageUrl ?? config.defaultItemImagePath ?? bearImage;

  return (
    <button
      type="button"
      onClick={() => onOrder(item)}
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-(--hairline) bg-(--surface-card) text-left transition-[border-color,transform] duration-300 hover:border-(--hairline-strong) active:scale-[0.99]"
    >
      {/* Imagery dominant — 70% */}
      <div className="relative aspect-square overflow-hidden">
        <Image
          src={imageSrc}
          alt={item.name}
          fill
          className="object-cover transition-opacity duration-500"
        />

        {/* badge-info pill — PS-style: full rounded, primary blue */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase"
            style={{
              backgroundColor: isRented
                ? "var(--brand-accent)"
                : "var(--brand-primary)",
              color: "white",
              letterSpacing: "0.045em",
            }}
          >
            {isRented ? "대여중" : "가능"}
          </span>
          {waitingCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
              +{waitingCount}
            </span>
          )}
        </div>
      </div>

      {/* Copy slot — 30%, body-md */}
      <div className="flex flex-1 flex-col justify-between gap-2 px-5 py-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-tight text-(--brand-text) sm:text-lg">
          {item.name}
        </h3>
        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-(--body-muted)">
          <span>{item.category}</span>
          {item.isTimeLimited && item.rentalTimeMinutes ? (
            <span className="font-mono normal-case tracking-normal">
              {item.rentalTimeMinutes}m
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
