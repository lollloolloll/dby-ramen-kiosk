import type { AgeGroupKey } from "@/lib/shared/ageGroup";

/**
 * 키오스크 인원 등록 입력 — 계층(유아/청소년/성인) x 성별(남/여) 6칸.
 *
 * 함께 온 인원의 계층이 방문자 본인과 다를 수 있어(예: 청소년 + 보호자)
 * 계층별로 직접 센다. 값은 visit_sessions의 6개 컬럼에 그대로 저장된다.
 */
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
// (유아 → 청소년 → 성인, 남 → 여)를 쓰도록 한 곳에서 정의한다.
export const HEADCOUNT_BUCKET_KEYS = [
  "childMale",
  "childFemale",
  "youthMale",
  "youthFemale",
  "adultMale",
  "adultFemale",
] as const satisfies readonly (keyof DbaseHeadcount)[];

export type DbaseHeadcountBucketKey = (typeof HEADCOUNT_BUCKET_KEYS)[number];

/** visit_sessions의 계층 x 성별 6개 컬럼 */
export type VisitSessionBuckets = Pick<DbaseHeadcount, DbaseHeadcountBucketKey>;

// 인원 등록 카드 — 계층별 남/여 카운터. 엑셀 컬럼과 같은 순서.
export const HEADCOUNT_TIERS = [
  { label: "유아", maleKey: "childMale", femaleKey: "childFemale" },
  { label: "청소년", maleKey: "youthMale", femaleKey: "youthFemale" },
  { label: "성인", maleKey: "adultMale", femaleKey: "adultFemale" },
] as const satisfies readonly {
  label: string;
  maleKey: DbaseHeadcountBucketKey;
  femaleKey: DbaseHeadcountBucketKey;
}[];

export function getHeadcountBucketSum(headcount: VisitSessionBuckets) {
  return HEADCOUNT_BUCKET_KEYS.reduce((sum, key) => sum + headcount[key], 0);
}

export function toVisitSessionBuckets(
  headcount: DbaseHeadcount
): VisitSessionBuckets {
  return {
    childMale: headcount.childMale,
    childFemale: headcount.childFemale,
    youthMale: headcount.youthMale,
    youthFemale: headcount.youthFemale,
    adultMale: headcount.adultMale,
    adultFemale: headcount.adultFemale,
  };
}

/**
 * 구버전 키오스크(남/여만 보내던 화면)의 페이로드를 6칸으로 옮긴다.
 * 배포 직후 새로고침 전 방문이 실패하지 않도록, 예전 방식대로
 * 방문자 본인 연령대 한 계층에 남/여를 몰아 넣는다.
 */
export function fromLegacyGenderHeadcount(
  legacy: { totalCount: number; male: number; female: number },
  tier: AgeGroupKey
): DbaseHeadcount {
  const headcount: DbaseHeadcount = {
    totalCount: legacy.totalCount,
    childMale: 0,
    childFemale: 0,
    youthMale: 0,
    youthFemale: 0,
    adultMale: 0,
    adultFemale: 0,
  };
  const target =
    tier === "child"
      ? HEADCOUNT_TIERS[0]
      : tier === "adult"
        ? HEADCOUNT_TIERS[2]
        : HEADCOUNT_TIERS[1];
  headcount[target.maleKey] = legacy.male;
  headcount[target.femaleKey] = legacy.female;
  return headcount;
}

/** 남/여 합계 — rental_records.male_count/female_count 용 */
export function getGenderTotals(headcount: VisitSessionBuckets) {
  return {
    male: headcount.childMale + headcount.youthMale + headcount.adultMale,
    female:
      headcount.childFemale + headcount.youthFemale + headcount.adultFemale,
  };
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
