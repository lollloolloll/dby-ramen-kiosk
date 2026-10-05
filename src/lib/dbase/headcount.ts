export type DbaseHeadcount = {
  totalCount: number;
  childMale: number;
  childFemale: number;
  youthMale: number;
  youthFemale: number;
  adultMale: number;
  adultFemale: number;
};

// 계층 x 성별 버킷 키 — 키오스크 UI / 검증 / 엑셀이 모두 같은 순서
// (아동 → 청소년 → 성인, 남 → 여)를 쓰도록 한 곳에서 정의한다.
export const HEADCOUNT_BUCKET_KEYS = [
  "childMale",
  "childFemale",
  "youthMale",
  "youthFemale",
  "adultMale",
  "adultFemale",
] as const satisfies readonly (keyof DbaseHeadcount)[];

export type DbaseHeadcountBucketKey = (typeof HEADCOUNT_BUCKET_KEYS)[number];

export function getHeadcountBucketSum(headcount: DbaseHeadcount) {
  return HEADCOUNT_BUCKET_KEYS.reduce((sum, key) => sum + headcount[key], 0);
}

export function assertValidHeadcount(headcount: DbaseHeadcount) {
  const values = [
    headcount.totalCount,
    ...HEADCOUNT_BUCKET_KEYS.map((key) => headcount[key]),
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
