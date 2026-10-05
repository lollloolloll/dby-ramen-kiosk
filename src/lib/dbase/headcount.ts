import type { AgeGroupKey } from "@/lib/shared/ageGroup";

/**
 * 키오스크 인원 등록 입력 — 남/여만 센다.
 *
 * 계층(아동/청소년/성인)은 직원이 고르지 않고 방문자 본인의 연령대로 정한다.
 * (예: 본인이 성인이면 그 방문 인원 전체가 성인 남/여로 기록된다.)
 * 계층 판정은 서버에서 생년월일로 다시 계산하므로 클라이언트 값을 믿지 않는다.
 */
export type DbaseHeadcount = {
  totalCount: number;
  male: number;
  female: number;
};

export type DbaseHeadcountGenderKey = "male" | "female";

export const HEADCOUNT_GENDERS = [
  { key: "male", label: "남" },
  { key: "female", label: "여" },
] as const satisfies readonly { key: DbaseHeadcountGenderKey; label: string }[];

/** visit_sessions의 계층 x 성별 6개 컬럼 */
export type VisitSessionBuckets = {
  childMale: number;
  childFemale: number;
  youthMale: number;
  youthFemale: number;
  adultMale: number;
  adultFemale: number;
};

const EMPTY_BUCKETS: VisitSessionBuckets = {
  childMale: 0,
  childFemale: 0,
  youthMale: 0,
  youthFemale: 0,
  adultMale: 0,
  adultFemale: 0,
};

export function getHeadcountBucketSum(headcount: DbaseHeadcount) {
  return headcount.male + headcount.female;
}

/**
 * 남/여 인원을 방문자 연령대에 해당하는 한 계층에만 몰아 넣는다.
 * 나머지 계층은 0 — 한 방문 세션은 하나의 계층만 채운다.
 */
export function toVisitSessionBuckets(
  headcount: DbaseHeadcount,
  tier: AgeGroupKey
): VisitSessionBuckets {
  switch (tier) {
    case "child":
      return {
        ...EMPTY_BUCKETS,
        childMale: headcount.male,
        childFemale: headcount.female,
      };
    case "adult":
      return {
        ...EMPTY_BUCKETS,
        adultMale: headcount.male,
        adultFemale: headcount.female,
      };
    case "youth":
    default:
      return {
        ...EMPTY_BUCKETS,
        youthMale: headcount.male,
        youthFemale: headcount.female,
      };
  }
}

export function assertValidHeadcount(headcount: DbaseHeadcount) {
  const values = [headcount.totalCount, headcount.male, headcount.female];

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
    throw new Error("총 인원은 남녀 인원 합계와 같아야 합니다.");
  }
}
