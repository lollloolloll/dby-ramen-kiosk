// D.Base 시간제 대여 분기 결정 — 순수 로직(DB 의존 없음, 단위 테스트 대상).
// 점유 단위는 "대여 1건 = 1" (그룹 인원수와 무관).

export type RentalDecision = "log" | "hold" | "queue";

type RentalItem = {
  isTimeLimited: boolean | null;
  quantity?: number | null;
};

/**
 * 아이템의 보유 수량 N.
 * items.quantity 컬럼(보유 수량) 값을 사용한다.
 * 시간제인데 미설정이면 1로 간주.
 */
export function itemQuantity(item: RentalItem): number {
  return item.quantity ?? 1;
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

/**
 * 대기 "최대" 예상 시간(분) 상한.
 * 반납 신호가 없어 정확 예측은 불가하므로 상한선만 제공한다.
 * position(1-based 대기 순번) 기준: 앞 사람들이 모두 풀타임 사용하는 최악의 경우
 * = ceil(position / N) 라운드 × rentalTimeMinutes. 실제로는 보통 더 빠르다.
 */
export function estimateMaxWaitMinutes(
  position: number,
  quantity: number,
  rentalTimeMinutes: number | null
): number {
  if (!rentalTimeMinutes || position <= 0) return 0;
  const n = quantity > 0 ? quantity : 1;
  return Math.ceil(position / n) * rentalTimeMinutes;
}
