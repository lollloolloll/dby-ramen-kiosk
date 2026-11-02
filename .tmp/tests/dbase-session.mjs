export function formatDbaseHeadcount(summary) {
    if (!summary)
        return "-";
    return [
        `총 ${summary.totalCount}명`,
        `유아 남 ${summary.childMale ?? 0}, 여 ${summary.childFemale ?? 0}`,
        `청소년 남 ${summary.youthMale}, 여 ${summary.youthFemale}`,
        `성인 남 ${summary.adultMale}, 여 ${summary.adultFemale}`,
    ].join(" · ");
}
