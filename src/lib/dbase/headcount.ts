export type DbaseHeadcount = {
  totalCount: number;
  youthMale: number;
  youthFemale: number;
  adultMale: number;
  adultFemale: number;
};

export function getHeadcountBucketSum(headcount: DbaseHeadcount) {
  return (
    headcount.youthMale +
    headcount.youthFemale +
    headcount.adultMale +
    headcount.adultFemale
  );
}

export function assertValidHeadcount(headcount: DbaseHeadcount) {
  const values = [
    headcount.totalCount,
    headcount.youthMale,
    headcount.youthFemale,
    headcount.adultMale,
    headcount.adultFemale,
  ];

  if (values.some((value) => !Number.isInteger(value))) {
    throw new Error("인원 수는 정수로 입력해주세요.");
  }

  if (values.some((value) => value < 0)) {
    throw new Error("인원 수는 0명 이상이어야 합니다.");
  }

  if (headcount.totalCount < 1) {
    throw new Error("총 인원은 최소 1명 이상이어야 합니다.");
  }

  if (headcount.totalCount !== getHeadcountBucketSum(headcount)) {
    throw new Error("총 인원은 세부 인원 합계와 같아야 합니다.");
  }
}
