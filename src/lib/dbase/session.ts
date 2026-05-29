export type DbaseVisitSessionSummary = {
  totalCount: number;
  youthMale: number;
  youthFemale: number;
  adultMale: number;
  adultFemale: number;
} | null;

export function formatDbaseHeadcount(summary: DbaseVisitSessionSummary) {
  if (!summary) return "-";

  return [
    `총 ${summary.totalCount}명`,
    `청소년 남 ${summary.youthMale}, 여 ${summary.youthFemale}`,
    `성인 남 ${summary.adultMale}, 여 ${summary.adultFemale}`,
  ].join(" · ");
}
