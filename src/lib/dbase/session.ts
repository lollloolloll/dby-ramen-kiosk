// 아동 버킷은 운영 중 추가되어, 그 이전 방문 세션 행에는 값이 없을 수 있다.
// (DB 컬럼이 nullable — drizzle/schema.ts 참고)
export type DbaseVisitSessionSummary = {
  totalCount: number;
  childMale?: number | null;
  childFemale?: number | null;
  youthMale: number;
  youthFemale: number;
  adultMale: number;
  adultFemale: number;
} | null;

export function formatDbaseHeadcount(summary: DbaseVisitSessionSummary) {
  if (!summary) return "-";

  return [
    `총 ${summary.totalCount}명`,
    `아동 남 ${summary.childMale ?? 0}, 여 ${summary.childFemale ?? 0}`,
    `청소년 남 ${summary.youthMale}, 여 ${summary.youthFemale}`,
    `성인 남 ${summary.adultMale}, 여 ${summary.adultFemale}`,
  ].join(" · ");
}
