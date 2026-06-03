// D.Base 시간제 대여 분기 결정 — 순수 로직(DB 의존 없음, 단위 테스트 대상).
// 점유 단위는 "대여 1건 = 1" (그룹 인원수와 무관).

export type RentalDecision = "log" | "hold" | "queue";

type RentalItem = {
  isTimeLimited: boolean | null;
  maxRentalsPerUser?: number | null;
};

/**
 * 아이템의 보유 수량 N.
 * `max_rentals_per_user` 컬럼을 재사용한다(라벨: "보유 수량").
 * 시간제인데 미설정이면 1로 간주.
 */
export function itemQuantity(item: RentalItem): number {
  return item.maxRentalsPerUser ?? 1;
}

/**
 * 선택한 아이템을 어떻게 처리할지 결정한다.
 * @param activeCount 해당 아이템의 미반납 대여 건수(1대여=1, 인원수 무관)
 * - 비시간제          -> "log"   (즉시 반납 방문 로그)
 * - 시간제 & 잔여 있음 -> "hold"  (점유 시작)
 * - 시간제 & 잔여 없음 -> "queue" (대기열)
 */
export function decideRentalAction(
  item: RentalItem,
  activeCount: number
): RentalDecision {
  if (!item.isTimeLimited) return "log";
  return activeCount < itemQuantity(item) ? "hold" : "queue";
}
