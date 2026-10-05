/**
 * 연령대(아동/청소년/성인) 판정 — 생년월일 기준.
 *
 * 기준은 청소년기본법(청소년 9~24세)에 맞춘 기존 집계 기준을 그대로 쓴다.
 *   - 만 8세 이하  → 아동
 *   - 만 9~24세    → 청소년
 *   - 만 25세 이상 → 성인
 *
 * 엑셀의 "연령대" 칼럼과 키오스크 인원 등록 계층이 같은 정의를 쓰도록
 * 여기 한 곳에만 둔다.
 */
export const AGE_GROUP_LABELS = {
  child: "아동",
  youth: "청소년",
  adult: "성인",
} as const;

export type AgeGroupKey = keyof typeof AGE_GROUP_LABELS;

export function calculateAge(
  birthDate: string | null | undefined,
  referenceDate: Date = new Date()
): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  let age = referenceDate.getFullYear() - birth.getFullYear();
  const m = referenceDate.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && referenceDate.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function getAgeGroup(age: number | null): string {
  if (age === null) return "알 수 없음";
  if (age <= 8) return AGE_GROUP_LABELS.child;
  if (age <= 24) return AGE_GROUP_LABELS.youth; // 9세 ~ 24세
  return AGE_GROUP_LABELS.adult; // 25세 이상
}

/**
 * 인원 등록 시 쓸 계층 키를 생년월일로 정한다.
 *
 * 생년월일이 없거나 깨져 있으면 방문을 막지 않고 "청소년"으로 본다.
 * (기관 주 이용층이고, 등록 폼이 생년월일을 필수로 받으므로 실제로는 드물다.)
 */
export function resolveAgeGroupKey(
  birthDate: string | null | undefined,
  referenceDate: Date = new Date()
): AgeGroupKey {
  const age = calculateAge(birthDate, referenceDate);
  if (age === null) return "youth";
  if (age <= 8) return "child";
  if (age <= 24) return "youth";
  return "adult";
}

export function getAgeGroupLabel(
  birthDate: string | null | undefined,
  referenceDate: Date = new Date()
): string {
  return AGE_GROUP_LABELS[resolveAgeGroupKey(birthDate, referenceDate)];
}
