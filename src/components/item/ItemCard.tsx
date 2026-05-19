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
 * Editorial 스타일 카드:
 * - 정사각 이미지 / 얇은 보더 / 그림자 없음
 * - 상단에 상태 마이크로 라벨, 하단에 이름 + 카운트
 * - hover 시 색만 미세 변화, scale 변형 X
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
      className="group relative flex h-full w-full flex-col overflow-hidden border border-(--brand-text)/10 bg-(--brand-bg) text-left transition-colors duration-300 hover:border-(--brand-text)/30"
    >
      <div className="relative aspect-square overflow-hidden bg-(--brand-primary-05)">
        <Image
          src={imageSrc}
          alt={item.name}
          fill
          className="object-cover transition-opacity duration-500 group-hover:opacity-90"
        />

        {/* 상태 마이크로 라벨 — 우상단 */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5 bg-(--brand-bg)/85 px-2 py-1 text-[10px] uppercase tracking-[0.18em] backdrop-blur-sm">
          <span
            className={
              isRented
                ? "inline-block h-1.5 w-1.5 rounded-full bg-(--brand-accent)"
                : "inline-block h-1.5 w-1.5 rounded-full bg-(--brand-primary)"
            }
          />
          <span className="text-(--brand-text)/80">
            {isRented ? "대여중" : "가능"}
          </span>
          {waitingCount > 0 && (
            <span className="ml-1 text-(--brand-muted)">+{waitingCount}</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-1 px-4 py-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-tight tracking-tight text-(--brand-text) sm:text-lg">
          {item.name}
        </h3>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-(--brand-muted)/80">
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
