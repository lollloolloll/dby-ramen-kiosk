"use client";

import { Badge } from "@/components/ui/badge";
import { Item } from "@/app/(admin)/admin/items/columns";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import bearImage from "@/assets/images/bear.png";
import { useTheme } from "@/components/theme/ThemeProvider";

interface ItemCardProps {
  item: Item;
  onOrder: (item: Item) => void;
}

export function ItemCard({ item, onOrder }: ItemCardProps) {
  const config = useTheme();
  const isRented = item.isTimeLimited ? item.status === "RENTED" : false;
  const waitingCount = item.waitingCount;

  // 폴백 체인: 아이템 자체 이미지 → 사이트 기본 이미지 → 정적 placeholder
  const imageSrc = item.imageUrl ?? config.defaultItemImagePath ?? bearImage;

  return (
    <Card
      className="relative flex flex-col overflow-hidden cursor-pointer transition-all hover:shadow-2xl hover:scale-[1.03] active:scale-[0.98] border-2 border-[color:var(--brand-primary-20)] hover:border-[color:var(--brand-primary-40)] bg-card pt-4"
      onClick={() => onOrder(item)}
    >
      <div className="absolute top-2 right-2 z-10">
        <Badge variant={isRented ? "rented" : "available"}>
          {isRented ? "대여 중" : "대여 가능"}
          {waitingCount > 0 && ` (${waitingCount}팀 대기)`}
        </Badge>
      </div>
      <div className="relative aspect-square bg-linear-to-br from-(--brand-primary-10) via-(--brand-accent-10) to-(--brand-accent-10)">
        <Image
          src={imageSrc}
          alt={item.name}
          fill
          className="object-cover"
        />
      </div>

      <div className="p-4 bg-linear-to-r from-(--brand-primary-05) to-(--brand-accent-05)">
        <h3 className="text-lg font-bold text-center line-clamp-2 text-foreground">
          {item.name}
        </h3>
      </div>
    </Card>
  );
}
