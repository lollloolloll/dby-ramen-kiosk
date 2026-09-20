/**
 * D.BASE(도봉동청소년문화의집) 방문 등록 키오스크 전용 문구.
 *
 * 와이어프레임(src/assets/wireframe/와이어프레임.pdf)의 카피를 기본값으로 둔다.
 * dby 플로우(DbaseKioskFlow)는 여기 있는 문자열만 사용하고 JSX에 한글을
 * 직접 박지 않는다 — 문구 수정은 이 파일 한 곳에서.
 *
 * `EDITABLE_DBASE_COPY_KEYS`에 들어간 키는 추후 ThemeBuilder의
 * "D.BASE 문구" 섹션에서 관리자가 덮어쓸 수 있도록 노출할 후보다.
 * 장식·구조 문자열(필드 라벨, 공통 버튼 등)은 상수로만 두어 편집 UI가
 * 비대해지지 않게 한다.
 */
export type DbaseCopy = {
  // 진입점(입장)
  brandEyebrow: string;
  entryTitle: string;
  entryFirstTime: string;
  entryReturning: string;
  // 신규 등록
  registerEyebrow: string;
  registerTitle: string;
  consentLabel: string;
  // 재방문 확인
  identifyEyebrow: string;
  identifyTitle: string;
  // 정보 불일치
  mismatchEyebrow: string;
  mismatchTitle: string;
  mismatchBody: string;
  mismatchRetry: string;
  mismatchRegister: string;
  // 인원수
  headcountEyebrow: string;
  headcountTitle: string;
  // 컨텐츠 선택
  contentsEyebrow: string;
  contentsTitle: string;
  // 최종 확인
  confirmEyebrow: string;
  // 완료(Welcome)
  doneEyebrow: string;
  doneTitle: string;
  doneSubtitle: string;
  // 필드 라벨
  fieldName: string;
  fieldPhone: string;
  fieldGender: string;
  fieldBirth: string;
  fieldPin: string;
  // 인원 카운터 라벨
  countTotal: string;
  countYouthMale: string;
  countYouthFemale: string;
  countAdultMale: string;
  countAdultFemale: string;
  // 공통 버튼/라벨
  buttonOk: string;
  buttonRestart: string;
  buttonBack: string;
  floorFallback: string;
};

export const DBASE_COPY: DbaseCopy = {
  brandEyebrow: "도봉동청소년문화의집 플레이그라운드",
  entryTitle: "두둥~ D.BASE 입장!",
  entryFirstTime: "처음 왔어요",
  entryReturning: "또 왔어요",

  registerEyebrow: "신규 등록",
  registerTitle: "처음 온 두리, 반가워~",
  consentLabel: "개인정보 수집 및 이용에 동의합니다",

  identifyEyebrow: "재방문 확인",
  identifyTitle: "오늘도 반가워!",

  mismatchEyebrow: "확인 필요",
  mismatchTitle: "입력하신 정보가 일치하지 않아요",
  mismatchBody: "혹시 처음 왔니?",
  mismatchRetry: "다시 입력",
  mismatchRegister: "신규 등록",

  headcountEyebrow: "인원 확인",
  headcountTitle: "몇 명이 왔어?",

  contentsEyebrow: "활동 선택",
  contentsTitle: "두근두근, 오늘은 뭐해?",

  confirmEyebrow: "최종 확인",

  doneEyebrow: "Welcome",
  doneTitle: "오늘 D.BASE에서 즐거운 시간 보내!",
  doneSubtitle: "",

  fieldName: "이름",
  fieldPhone: "연락처",
  fieldGender: "성별",
  fieldBirth: "생년월일",
  fieldPin: "전화번호 가운데 4자리",

  countTotal: "총",
  countYouthMale: "청소년 남",
  countYouthFemale: "청소년 여",
  countAdultMale: "성인 남",
  countAdultFemale: "성인 여",

  buttonOk: "OK",
  buttonRestart: "처음으로",
  buttonBack: "이전",
  floorFallback: "Playground",
};

/**
 * ThemeBuilder에서 관리자가 덮어쓸 수 있도록 노출할 키(Phase 2).
 * 의미 있는 헤드라인/안내 문구만 골라 편집 UI가 비대해지지 않게 한다.
 */
export const EDITABLE_DBASE_COPY_KEYS = [
  "brandEyebrow",
  "entryTitle",
  "entryFirstTime",
  "entryReturning",
  "registerTitle",
  "identifyTitle",
  "mismatchTitle",
  "mismatchBody",
  "headcountTitle",
  "contentsTitle",
  "doneTitle",
  "doneSubtitle",
] as const satisfies ReadonlyArray<keyof DbaseCopy>;

export type EditableDbaseCopyKey = (typeof EDITABLE_DBASE_COPY_KEYS)[number];

/** 관리자 편집용 override 형태 — 편집 가능한 키만, 전부 optional. */
export type DbaseCopyOverride = Partial<Record<EditableDbaseCopyKey, string>>;

/**
 * 기본 문구 위에 (관리자) override를 얕게 병합한다. null/빈 문자열 키는 무시해
 * 기본값을 유지한다. Phase 2에서 config.dbaseCopy를 넘겨 사용한다.
 */
export function mergeDbaseCopy(
  override?: Partial<Record<keyof DbaseCopy, string | null | undefined>> | null
): DbaseCopy {
  if (!override) return DBASE_COPY;
  const merged = { ...DBASE_COPY };
  for (const key of Object.keys(merged) as Array<keyof DbaseCopy>) {
    const value = override[key];
    if (typeof value === "string" && value.trim().length > 0) {
      merged[key] = value;
    }
  }
  return merged;
}
