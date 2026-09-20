"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  UserPlus,
} from "lucide-react";
import type { Item } from "@/app/(admin)/admin/items/columns";
import youthFacilityImage from "@/assets/images/default-item.png";
import { AuroraBackground } from "@/components/visuals/AuroraBackground";
import {
  ParticleWaveBackground,
  type WaveMode,
} from "@/components/visuals/ParticleWaveBackground";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePreviewMode } from "@/lib/hooks/usePreviewMode";
import {
  findUsersByPin,
  type UserPinLookupResult,
} from "@/lib/actions/generalUser";
import {
  checkDbaseIdentity,
  commitDbaseVisit,
  registerDbaseUser,
  type DbaseIdentityMatch,
  type DbaseItemOutcome,
} from "@/lib/actions/dbase";
import {
  assertValidHeadcount,
  type DbaseHeadcount,
} from "@/lib/dbase/headcount";
import { mergeDbaseCopy } from "@/lib/dbase/copy";
import { getDbaseInitialStep } from "@/components/dbase/preview-step";
import { getGridColsClass } from "@/lib/theme/theme-utils";
import { resolveVisualMode, resolveWaveMode } from "@/lib/theme/visual-mode";
import { cn } from "@/lib/utils";

type Step =
  | "entry"
  | "register"
  | "identityConfirm"
  | "identify"
  | "mismatch"
  | "headcount"
  | "contents"
  | "done";

type Visitor = {
  id: number;
  name: string;
};

type RegisterForm = {
  name: string;
  phoneNumber: string;
  gender: "" | "남" | "여";
  birthDate: string;
  school: string;
  personalInfoConsent: boolean;
};

const FLOOR = process.env.NEXT_PUBLIC_FLOOR;

// 디스플레이 헤드라인 레시피 — Pretendard(본문과 동일) + 굵게(700).
// 기존 var(--font-display)(Bricolage)는 라틴 전용이라 한글이 Pretendard로 폴백되며
// wght 300으로 얇게 보이던 문제를 해결. inline fontWeight가 font-light 클래스를 덮어씀.
const displayHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontWeight: 700,
};

const emptyHeadcount: DbaseHeadcount = {
  totalCount: 0,
  youthMale: 0,
  youthFemale: 0,
  adultMale: 0,
  adultFemale: 0,
};

const formatPhoneNumber = (value: string) => {
  const digits = value.replace(/[^\d]/g, "").slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

// 교급 선택 — 학교명은 등록하지 않고 교급만 저장한다.
// value는 기존 데이터(school 필드)와의 호환을 위해 school.ts의 getSchoolLevel이
// 인식하는 값을 그대로 사용한다.
const GRADE_LEVELS = [
  { label: "초", value: "초등학교" },
  { label: "중", value: "중학교" },
  { label: "고", value: "고등학교" },
  { label: "대(후기 청소년)", value: "대학교" },
  { label: "성인", value: "성인" },
] as const;

export function DbaseKioskFlow({
  items,
}: {
  items: Item[];
}) {
  const config = useTheme();
  const copy = mergeDbaseCopy(config.dbaseCopy);
  const isPreview = usePreviewMode();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [step, setStep] = useState<Step>(() =>
    getDbaseInitialStep(searchParams)
  );
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [identifyPin, setIdentifyPin] = useState("");
  const [pinMatches, setPinMatches] = useState<
    Extract<UserPinLookupResult, { status: "multiple_matches" }>["users"] | null
  >(null);
  // 등록 시 이름+전화번호가 겹치는 기존 회원 — "OO님 맞아?" 확인 대기 중.
  // 생년월일만 다른 동명이인+동일 전화번호가 여러 명일 수 있어 배열로 둔다.
  const [pendingMatches, setPendingMatches] = useState<
    DbaseIdentityMatch[] | null
  >(null);
  // register 스텝 내부 단계: 이름+전화번호만 먼저 확인 → 안 겹치면 나머지 입력
  const [registerPhase, setRegisterPhase] = useState<"identity" | "details">(
    "identity"
  );
  // "OO님 맞아?"에서 "아니, 다른 사람이야"를 고른 경우 — 최종 제출 시 강제로 새 레코드 생성
  const [forceNewOnSubmit, setForceNewOnSubmit] = useState(false);
  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    name: "",
    phoneNumber: "",
    gender: "",
    birthDate: "",
    school: "",
    personalInfoConsent: false,
  });
  // 생년월일(년/월/일 분리) 보조 상태 — smy 모달 패턴
  const [birthYear, setBirthYear] = useState<string>();
  const [birthMonth, setBirthMonth] = useState<string>();
  const [birthDay, setBirthDay] = useState<string>();
  const [registerAttempted, setRegisterAttempted] = useState(false);
  const [headcount, setHeadcount] = useState<DbaseHeadcount>(emptyHeadcount);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [outcomes, setOutcomes] = useState<DbaseItemOutcome[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from(
      { length: currentYear - 1929 },
      (_, i) => currentYear - i
    );
  }, []);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const days = useMemo(() => {
    if (!birthYear || !birthMonth)
      return Array.from({ length: 31 }, (_, i) => i + 1);
    const daysInMonth = new Date(
      parseInt(birthYear),
      parseInt(birthMonth),
      0
    ).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }, [birthYear, birthMonth]);

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(items.map((item) => item.category))
    );
    return ["전체", ...uniqueCategories.sort()];
  }, [items]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === "전체") {
      return items;
    }
    return items.filter((item) => item.category === selectedCategory);
  }, [items, selectedCategory]);

  // 진입점·키오스크 전 스텝이 동일한 배경(셰이더)을 공유하도록, smy/홈과 같은
  // 우선순위로 visualMode를 결정한다. fallback도 홈·smy와 동일하게 "lava"로 맞춤.
  const visualMode = resolveVisualMode(config, searchParams, "lava");
  const waveMode: WaveMode = resolveWaveMode(searchParams);

  const resetFlow = () => {
    setStep("entry");
    setVisitor(null);
    setIdentifyPin("");
    setPinMatches(null);
    setPendingMatches(null);
    setRegisterPhase("identity");
    setForceNewOnSubmit(false);
    setRegisterForm({
      name: "",
      phoneNumber: "",
      gender: "",
      birthDate: "",
      school: "",
      personalInfoConsent: false,
    });
    setBirthYear(undefined);
    setBirthMonth(undefined);
    setBirthDay(undefined);
    setRegisterAttempted(false);
    setHeadcount(emptyHeadcount);
    setSelectedItemIds([]);
    setSelectedCategory("전체");
    setOutcomes([]);
    setError("");
    setIsSubmitting(false);
  };

  // "처음으로" / 완료 후 복귀 — 홈(랜딩)으로 이동. 유휴 타이머와 동일 동작.
  const goHome = () => {
    if (isPreview) return;
    router.push("/");
  };

  const resetInactivityTimer = () => {
    if (isPreview) return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      // 유휴 시 홈으로 이동 + 프로모션 영상 즉시 표시 플래그
      try {
        sessionStorage.setItem(
          "showPromotionOnHome",
          JSON.stringify({ show: true, timestamp: Date.now(), ttl: 5000 })
        );
      } catch {
        // sessionStorage 불가 환경 무시
      }
      router.push("/");
    }, config.inactivityTimeoutMs);
  };

  const enterFullscreen = () => {
    if (isPreview) return;
    try {
      if (
        typeof document !== "undefined" &&
        !document.fullscreenElement &&
        document.documentElement.requestFullscreen
      ) {
        void document.documentElement.requestFullscreen();
      }
    } catch {
      // 전체화면 미지원/거부 — 무시 (PWA standalone이면 이미 전체화면)
    }
  };

  useEffect(() => {
    if (isPreview) return;
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "touchstart",
      "click",
    ] as const;
    events.forEach((event) => {
      window.addEventListener(event, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, resetInactivityTimer);
      });
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [config.inactivityTimeoutMs, isPreview]);

  useEffect(() => {
    if (step !== "done" || isPreview) return;
    const timeout = setTimeout(goHome, 3000);
    return () => clearTimeout(timeout);
  }, [step, isPreview]);

  const updateHeadcount = (key: keyof DbaseHeadcount, delta: number) => {
    if (key === "totalCount") return; // 총원은 세부 인원 합계로 자동 계산
    setHeadcount((current) => {
      const next = { ...current, [key]: Math.max(0, current[key] + delta) };
      next.totalCount =
        next.youthMale + next.youthFemale + next.adultMale + next.adultFemale;
      return next;
    });
  };

  const handleIdentify = async () => {
    setError("");
    const pin = identifyPin.replace(/[^\d]/g, "");
    if (pin.length !== 4) {
      setError("전화번호 가운데 4자리를 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await findUsersByPin(pin);
      if (result.status === "single_match") {
        setVisitor({ id: result.user.id, name: result.user.name });
        setStep("headcount");
        return;
      }
      if (result.status === "multiple_matches") {
        setPinMatches(result.users);
        setError("");
        return;
      }
      setStep("mismatch");
    } catch (event) {
      setError(
        event instanceof Error
          ? event.message
          : "사용자 확인 중 오류가 발생했습니다."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 필드별 검증 — 등록 제출 시 빨간 ring으로 어디가 비었는지 명확히 표시 (아이 사용)
  const registerIdentityErrors = {
    name: registerForm.name.trim().length === 0,
    phoneNumber: !/^010-\d{4}-\d{4}$/.test(registerForm.phoneNumber),
  };
  const registerDetailErrors = {
    gender: registerForm.gender === "",
    birthDate: !/^\d{4}-\d{1,2}-\d{1,2}$/.test(registerForm.birthDate),
    school: registerForm.school.trim().length === 0,
  };
  const registerFieldErrors = {
    ...registerIdentityErrors,
    ...registerDetailErrors,
  };

  // 1단계: 이름+전화번호만 먼저 확인 — 겹치는 회원이 있으면 나머지 입력 없이
  // 바로 "OO님 맞아?"로, 없으면 나머지 항목 입력 단계로 넘어간다.
  const handleIdentityCheck = async () => {
    setError("");
    if (Object.values(registerIdentityErrors).some(Boolean)) {
      setRegisterAttempted(true);
      setError("이름과 전화번호를 확인해주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await checkDbaseIdentity({
        name: registerForm.name,
        phoneNumber: registerForm.phoneNumber,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if ("multiple" in result) {
        setPendingMatches(result.users);
        setStep("identityConfirm");
        return;
      }
      if (result.exists) {
        setPendingMatches([{ ...result.user, birthDate: null }]);
        setStep("identityConfirm");
        return;
      }
      setRegisterAttempted(false);
      setRegisterPhase("details");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (forceNewRecord = false) => {
    setError("");
    if (Object.values(registerFieldErrors).some(Boolean)) {
      setRegisterAttempted(true);
      setError("표시된 항목을 확인해주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await registerDbaseUser({
        ...registerForm,
        forceNewRecord,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if ("needsConfirmation" in result) {
        setPendingMatches([{ ...result.existingUser, birthDate: null }]);
        setStep("identityConfirm");
        return;
      }
      setVisitor(result.user);
      setPendingMatches(null);
      setRegisterAttempted(false);
      setForceNewOnSubmit(false);
      setStep("headcount");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHeadcountNext = () => {
    setError("");
    try {
      assertValidHeadcount(headcount);
      setStep("contents");
    } catch (event) {
      setError(
        event instanceof Error ? event.message : "인원 수를 확인해주세요."
      );
    }
  };

  const toggleContent = (item: Item) => {
    setSelectedItemIds((current) =>
      current.includes(item.id)
        ? current.filter((id) => id !== item.id)
        : [...current, item.id]
    );
  };

  const handleCommit = async () => {
    if (!visitor) {
      setError("사용자 정보가 없습니다.");
      setStep("entry");
      return;
    }
    if (selectedItemIds.length === 0) {
      setError("오늘 이용할 컨텐츠를 선택해주세요.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      const result = await commitDbaseVisit({
        userId: visitor.id,
        headcount,
        itemIds: selectedItemIds,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOutcomes(result.data.outcomes);
      setStep("done");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedItems = items.filter((item) =>
    selectedItemIds.includes(item.id)
  );

  return (
    // 배경(블러 원 등)을 감싸는 overflow-hidden을 최상위(스크롤 콘텐츠까지 포함)에
    // 두면 position:sticky의 "가장 가까운 스크롤 조상"이 이 div가 되어버려
    // sticky가 먹지 않는다. 그래서 overflow-hidden은 뷰포트 고정 배경 레이어에만
    // 걸고, 콘텐츠 쪽에는 걸지 않는다.
    <div className="relative min-h-screen bg-(--brand-bg)">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <DbaseBackground
          backgroundPath={config.backgroundPath}
          backgroundType={config.backgroundType}
          visualMode={visualMode}
          waveMode={waveMode}
          paused={isPreview}
          colorCore={config.colorPrimary}
          colorFringe={config.colorAccent}
        />
      </div>

      <div
        className="relative z-10 flex min-h-screen flex-col text-(--brand-text)"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {/* ── 공통 다크 네비 밴드 (smy 이식) — 전 스텝 동일 chrome ── */}
        <nav className="relative z-20 flex h-12 items-center justify-between bg-brand-text px-6 text-(--brand-bg) sm:px-12 animate-in fade-in slide-in-from-top-1 fill-mode-backwards duration-500">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={goHome}
              className="group inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-(--brand-bg)/70 transition-colors hover:text-(--brand-bg)"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-0.5" />
              <span>{copy.buttonRestart}</span>
            </button>
            <span className="flex items-center gap-1.5 border-l border-(--brand-bg)/15 pl-5 text-[11px] font-medium uppercase tracking-[0.18em] text-(--brand-bg)/60">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: "var(--brand-primary)",
                  boxShadow:
                    "0 0 0 3px color-mix(in srgb, var(--brand-primary) 25%, transparent)",
                }}
              />
              {FLOOR ? `Floor ${FLOOR}` : copy.floorFallback}
            </span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-(--brand-bg)/40">
            {config.orgName || "D.BASE"}
          </span>
        </nav>

        <main
          className={cn(
            "relative z-10 flex flex-1",
            step === "contents"
              ? "bg-(--brand-bg)"
              : "items-center px-5 py-10 sm:px-12 sm:py-14"
          )}
        >
          <div
            className={cn(
              "mx-auto w-full",
              step === "contents" ? "" : "max-w-5xl"
            )}
          >
            {step === "entry" && (
              <section className="grid min-h-[60vh] content-center gap-12">
                <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards duration-700">
                  <p className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-(--body-muted)">
                    <Sparkles className="h-3.5 w-3.5 text-(--brand-primary)" />
                    {copy.brandEyebrow}
                  </p>
                  <h1
                    className="text-5xl font-light leading-[1.04] tracking-[-0.02em] sm:text-7xl"
                    style={displayHeadingStyle}
                  >
                    {copy.entryTitle}
                  </h1>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <EntryButton
                    icon={<UserPlus className="h-7 w-7" />}
                    label={copy.entryFirstTime}
                    delayMs={120}
                    onClick={() => {
                      // 직전 세션 잔여 상태 제거 후 진행 (다중 사용자 키오스크)
                      resetFlow();
                      enterFullscreen();
                      setStep("register");
                    }}
                  />
                  <EntryButton
                    icon={<RotateCcw className="h-7 w-7" />}
                    label={copy.entryReturning}
                    delayMs={200}
                    onClick={() => {
                      // 직전 세션 잔여 상태 제거 후 진행 (다중 사용자 키오스크)
                      resetFlow();
                      enterFullscreen();
                      setStep("identify");
                    }}
                  />
                </div>
              </section>
            )}

            {step === "register" && (
              <Panel
                eyebrow={copy.registerEyebrow}
                title={copy.registerTitle}
                footer={
                  registerPhase === "identity" ? (
                    <FlowFooter
                      backLabel={copy.buttonRestart}
                      nextLabel={copy.buttonOk}
                      onBack={() => setStep("entry")}
                      onNext={handleIdentityCheck}
                      disabled={isSubmitting}
                    />
                  ) : (
                    <FlowFooter
                      backLabel={copy.buttonBack}
                      nextLabel={copy.buttonOk}
                      onBack={() => {
                        setError("");
                        setRegisterPhase("identity");
                      }}
                      onNext={() => handleRegister(forceNewOnSubmit)}
                      disabled={isSubmitting}
                    />
                  )
                }
              >
                {registerPhase === "identity" ? (
                  <div className="grid gap-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={copy.fieldName}>
                        <Input
                          type="text"
                          inputMode="text"
                          value={registerForm.name}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          lang="ko"
                          autoFocus
                          onChange={(event) =>
                            setRegisterForm((current) => ({
                              ...current,
                              name: event.target.value.replace(
                                /[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/g,
                                ""
                              ),
                            }))
                          }
                          className={cn(
                            "h-14 text-lg",
                            registerAttempted &&
                              registerFieldErrors.name &&
                              "border-red-500 ring-2 ring-red-500/40"
                          )}
                        />
                      </Field>
                      <Field label={copy.fieldPhone}>
                        <Input
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          autoCorrect="off"
                          maxLength={13}
                          value={registerForm.phoneNumber}
                          onChange={(event) =>
                            setRegisterForm((current) => ({
                              ...current,
                              phoneNumber: formatPhoneNumber(
                                event.target.value
                              ),
                            }))
                          }
                          placeholder="010-0000-0000"
                          className={cn(
                            "h-14 text-lg",
                            registerAttempted &&
                              registerFieldErrors.phoneNumber &&
                              "border-red-500 ring-2 ring-red-500/40"
                          )}
                        />
                      </Field>
                    </div>
                    {error && <ErrorText>{error}</ErrorText>}
                  </div>
                ) : (
                  <div className="grid gap-5">
                    <p className="text-sm text-(--body-muted)">
                      {registerForm.name} · {registerForm.phoneNumber}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                    <FieldGroup label={copy.fieldGender}>
                      <div
                        className={cn(
                          "grid grid-cols-2 gap-3 rounded-2xl",
                          registerAttempted &&
                            registerFieldErrors.gender &&
                            "p-1 ring-2 ring-red-500/40"
                        )}
                      >
                        {(["남", "여"] as const).map((gender) => (
                          <Button
                            key={gender}
                            type="button"
                            variant={
                              registerForm.gender === gender
                                ? "default"
                                : "outline"
                            }
                            className="h-14 text-lg"
                            onClick={() =>
                              setRegisterForm((current) => ({
                                ...current,
                                gender,
                              }))
                            }
                          >
                            {gender}
                          </Button>
                        ))}
                      </div>
                    </FieldGroup>

                    <FieldGroup label={copy.fieldBirth}>
                      <div
                        className={cn(
                          "grid grid-cols-3 gap-2 rounded-2xl",
                          registerAttempted &&
                            registerFieldErrors.birthDate &&
                            "p-1 ring-2 ring-red-500/40"
                        )}
                      >
                        <Select
                          value={birthYear}
                          onValueChange={(value) => {
                            setBirthYear(value);
                            setRegisterForm((c) => ({
                              ...c,
                              birthDate: `${value}-${birthMonth ?? ""}-${
                                birthDay ?? ""
                              }`,
                            }));
                          }}
                        >
                          <SelectTrigger className="h-14 text-base">
                            <SelectValue placeholder="년" />
                          </SelectTrigger>
                          <SelectContent
                            position="popper"
                            className="max-h-[300px]"
                          >
                            {years.map((year) => (
                              <SelectItem key={year} value={String(year)}>
                                {year}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={birthMonth}
                          onValueChange={(value) => {
                            setBirthMonth(value);
                            setRegisterForm((c) => ({
                              ...c,
                              birthDate: `${birthYear ?? ""}-${value}-${
                                birthDay ?? ""
                              }`,
                            }));
                          }}
                        >
                          <SelectTrigger className="h-14 text-base">
                            <SelectValue placeholder="월" />
                          </SelectTrigger>
                          <SelectContent
                            position="popper"
                            className="max-h-[300px]"
                          >
                            {months.map((month) => (
                              <SelectItem key={month} value={String(month)}>
                                {month}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={birthDay}
                          onValueChange={(value) => {
                            setBirthDay(value);
                            setRegisterForm((c) => ({
                              ...c,
                              birthDate: `${birthYear ?? ""}-${
                                birthMonth ?? ""
                              }-${value}`,
                            }));
                          }}
                        >
                          <SelectTrigger className="h-14 text-base">
                            <SelectValue placeholder="일" />
                          </SelectTrigger>
                          <SelectContent
                            position="popper"
                            className="max-h-[300px]"
                          >
                            {days.map((day) => (
                              <SelectItem key={day} value={String(day)}>
                                {day}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </FieldGroup>
                  </div>

                  <FieldGroup label="교급">
                    <div
                      className={cn(
                        "grid grid-cols-3 gap-2 rounded-2xl sm:grid-cols-5",
                        registerAttempted &&
                          registerFieldErrors.school &&
                          "p-1 ring-2 ring-red-500/40"
                      )}
                    >
                      {GRADE_LEVELS.map((grade) => (
                        <Button
                          key={grade.value}
                          type="button"
                          variant={
                            registerForm.school === grade.value
                              ? "default"
                              : "outline"
                          }
                          className="h-12"
                          onClick={() =>
                            setRegisterForm((c) => ({
                              ...c,
                              school: grade.value,
                            }))
                          }
                        >
                          {grade.label}
                        </Button>
                      ))}
                    </div>
                  </FieldGroup>

                  <label className="flex items-center gap-3 rounded-2xl border border-(--hairline) bg-(--brand-bg)/40 px-4 py-4 text-base">
                    <Checkbox
                      checked={registerForm.personalInfoConsent}
                      onCheckedChange={(checked) =>
                        setRegisterForm((current) => ({
                          ...current,
                          personalInfoConsent: checked === true,
                        }))
                      }
                    />
                    {copy.consentLabel}
                  </label>
                  {error && <ErrorText>{error}</ErrorText>}
                </div>
                )}
              </Panel>
            )}

            {step === "identityConfirm" && pendingMatches && (
              <Panel
                eyebrow="확인 필요"
                title={`${pendingMatches[0].name} 맞아?`}
              >
                {pendingMatches.length === 1 ? (
                  <>
                    <p className="text-xl text-(--body-muted)">
                      같은 이름과 전화번호로 등록된 회원이 있어.
                    </p>
                    <div className="mt-8 grid gap-3 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-14 text-lg"
                        disabled={isSubmitting}
                        onClick={() => {
                          setPendingMatches(null);
                          setForceNewOnSubmit(true);
                          setRegisterPhase("details");
                          setStep("register");
                        }}
                      >
                        아니, 다른 사람이야
                      </Button>
                      <Button
                        type="button"
                        className="h-14 text-lg"
                        disabled={isSubmitting}
                        onClick={() => {
                          setVisitor(pendingMatches[0]);
                          setPendingMatches(null);
                          setRegisterAttempted(false);
                          setStep("headcount");
                        }}
                      >
                        응, 나 맞아
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* 이름+전화번호까지 같은데 생년월일이 다른 회원이 여러
                        명 — 이미 이름+전화번호를 정확히 입력한 상태라
                        생년월일을 보여줘도 낯선 사람에게 정보가 새는 게
                        아니다(본인만 알 수 있는 조합을 이미 입력했으므로). */}
                    <p className="text-xl text-(--body-muted)">
                      같은 이름과 전화번호를 쓰는 회원이 여러 명이에요.
                      생년월일로 골라줘.
                    </p>
                    <div className="mt-8 grid gap-3">
                      {pendingMatches.map((match) => (
                        <Button
                          key={match.id}
                          type="button"
                          variant="outline"
                          className="h-14 text-lg"
                          disabled={isSubmitting}
                          onClick={() => {
                            setVisitor(match);
                            setPendingMatches(null);
                            setRegisterAttempted(false);
                            setStep("headcount");
                          }}
                        >
                          {match.birthDate || "생년월일 미상"}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-14 text-lg"
                        disabled={isSubmitting}
                        onClick={() => {
                          setPendingMatches(null);
                          setForceNewOnSubmit(true);
                          setRegisterPhase("details");
                          setStep("register");
                        }}
                      >
                        아니, 다른 사람이야
                      </Button>
                    </div>
                  </>
                )}
                {error && <ErrorText>{error}</ErrorText>}
              </Panel>
            )}

            {step === "identify" && (
              <Panel
                eyebrow={copy.identifyEyebrow}
                title={copy.identifyTitle}
                // 박스 폭 = 안쪽 콘텐츠(max-w-xs=320px) + 좌우 패딩(sm:p-10=40px*2)
                // 를 정확히 맞춰서 좌우 여백이 대칭이 되도록 한다.
                maxWidthClassName="max-w-[25rem]"
                footer={
                  <div className="max-w-xs">
                    {pinMatches ? (
                      <div className="mt-8 grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12 px-2 text-sm"
                          onClick={() => {
                            setPinMatches(null);
                            setIdentifyPin("");
                            setError("");
                          }}
                        >
                          다시 입력
                        </Button>
                        <Button
                          type="button"
                          className="h-12 px-2 text-sm"
                          onClick={() => {
                            setPinMatches(null);
                            setIdentifyPin("");
                            setError("");
                            setRegisterPhase("identity");
                            setForceNewOnSubmit(false);
                            setStep("register");
                          }}
                        >
                          회원 등록
                        </Button>
                      </div>
                    ) : (
                      <FlowFooter
                        backLabel={copy.buttonRestart}
                        nextLabel={copy.buttonOk}
                        onBack={() => setStep("entry")}
                        onNext={handleIdentify}
                        disabled={isSubmitting}
                      />
                    )}
                  </div>
                }
              >
                {!pinMatches ? (
                  <div className="grid w-full max-w-xs gap-5">
                    <Field
                      label={highlightSubstring(
                        copy.fieldPin,
                        "가운데",
                        "text-(--brand-primary)"
                      )}
                      labelClassName="text-base font-bold text-(--brand-text)"
                    >
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        lang="ko"
                        maxLength={4}
                        placeholder="1234"
                        value={identifyPin}
                        autoFocus
                        onChange={(event) =>
                          setIdentifyPin(event.target.value.replace(/[^\d]/g, ""))
                        }
                        className="h-16 text-center text-3xl font-bold tracking-[0.3em] focus-visible:ring-2 focus-visible:ring-(--brand-primary) focus-visible:ring-offset-2"
                      />
                    </Field>
                  </div>
                ) : (
                  <div className="grid w-full max-w-xs gap-3">
                    <p className="mb-1 text-sm text-(--body-muted)">
                      같은 번호를 쓰는 회원이 여러 명이에요. 본인을 골라줘.
                    </p>
                    {pinMatches.map((user) => (
                      <Button
                        key={user.id}
                        type="button"
                        variant="outline"
                        className="h-14 justify-center text-lg font-semibold"
                        onClick={() => {
                          setVisitor({ id: user.id, name: user.name });
                          setPinMatches(null);
                          setIdentifyPin("");
                          setStep("headcount");
                        }}
                      >
                        {user.name}
                      </Button>
                    ))}
                  </div>
                )}
                {error && <ErrorText>{error}</ErrorText>}
              </Panel>
            )}

            {step === "mismatch" && (
              <Panel eyebrow={copy.mismatchEyebrow} title={copy.mismatchTitle}>
                <p className="text-xl text-(--body-muted)">
                  {copy.mismatchBody}
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 text-lg"
                    onClick={() => {
                      setIdentifyPin("");
                      setPinMatches(null);
                      setStep("identify");
                    }}
                  >
                    {copy.mismatchRetry}
                  </Button>
                  <Button
                    type="button"
                    className="h-14 text-lg"
                    onClick={() => {
                      setRegisterPhase("identity");
                      setForceNewOnSubmit(false);
                      setStep("register");
                    }}
                  >
                    {copy.mismatchRegister}
                  </Button>
                </div>
              </Panel>
            )}

            {step === "headcount" && (
              <Panel
                eyebrow={copy.headcountEyebrow}
                title={copy.headcountTitle}
                footer={
                  <FlowFooter
                    backLabel={copy.buttonBack}
                    nextLabel={copy.buttonOk}
                    onBack={() => setStep("entry")}
                    onNext={handleHeadcountNext}
                  />
                }
              >
                <div className="grid gap-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-(--hairline) bg-(--brand-bg)/40 p-4">
                      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-(--body-muted)">
                        청소년
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <Counter
                          label="남"
                          value={headcount.youthMale}
                          onMinus={() => updateHeadcount("youthMale", -1)}
                          onPlus={() => updateHeadcount("youthMale", 1)}
                        />
                        <Counter
                          label="여"
                          value={headcount.youthFemale}
                          onMinus={() => updateHeadcount("youthFemale", -1)}
                          onPlus={() => updateHeadcount("youthFemale", 1)}
                        />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-(--hairline) bg-(--brand-bg)/40 p-4">
                      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-(--body-muted)">
                        성인
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <Counter
                          label="남"
                          value={headcount.adultMale}
                          onMinus={() => updateHeadcount("adultMale", -1)}
                          onPlus={() => updateHeadcount("adultMale", 1)}
                        />
                        <Counter
                          label="여"
                          value={headcount.adultFemale}
                          onMinus={() => updateHeadcount("adultFemale", -1)}
                          onPlus={() => updateHeadcount("adultFemale", 1)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 총 인원은 세부 인원 합계로 자동 계산 (읽기 전용 표시) */}
                  <div
                    className="flex items-center justify-center gap-4 rounded-2xl px-6 py-5"
                    style={{
                      backgroundColor: "var(--brand-primary)",
                      color: "var(--brand-on-primary)",
                    }}
                  >
                    <span className="text-sm font-semibold uppercase tracking-[0.18em] opacity-80">
                      {copy.countTotal}
                    </span>
                    <span
                      className="text-5xl font-light tabular-nums"
                      style={displayHeadingStyle}
                    >
                      {headcount.totalCount}
                    </span>
                    <span className="text-xl font-semibold">명</span>
                  </div>
                </div>
                {error && <ErrorText>{error}</ErrorText>}
              </Panel>
            )}

            {step === "contents" && (
              // 태블릿(1280x800 가로) 기준 — 스크롤 없이 8개 아이템(4x2)이
              // 한 화면에 다 들어오도록 헤더/그리드/카드 여백을 압축했다.
              <section className="relative pb-1">
                <header className="relative border-b border-(--hairline) px-6 pt-2 pb-1.5 sm:px-10 md:px-12 lg:px-16 animate-in fade-in slide-in-from-top-2 fill-mode-backwards duration-700">
                  <div className="mx-auto flex max-w-[1280px] flex-col gap-1">
                    <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.22em] text-(--body-muted)">
                      <span>Catalog</span>
                      <div className="flex items-center gap-4">
                        <span>
                          {filteredItems.length}
                          <span className="mx-1.5 text-(--brand-text)/20">
                            /
                          </span>
                          {items.length} items
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 px-3 text-[11px]"
                          onClick={() => setStep("headcount")}
                        >
                          {copy.buttonBack}
                        </Button>
                      </div>
                    </div>

                    <h2 className="text-2xl font-light leading-[1.05] tracking-[-0.02em] text-(--brand-text) sm:text-3xl">
                      {copy.contentsTitle}
                    </h2>

                    {categories.length > 1 && (
                      <div className="mt-0.5 flex items-center gap-2 overflow-x-auto scrollbar-hidden">
                        {categories.map((category) => {
                          const active = selectedCategory === category;
                          return (
                            <button
                              key={category}
                              type="button"
                              onClick={() => setSelectedCategory(category)}
                              className={cn(
                                "shrink-0 rounded-full px-3 py-0.5 text-[11px] font-bold uppercase transition-colors",
                                !active &&
                                  "border border-(--hairline-strong) bg-transparent text-(--brand-text)/70 hover:border-(--brand-text)/40 hover:text-(--brand-text)"
                              )}
                              style={
                                active
                                  ? {
                                      backgroundColor: "var(--brand-primary)",
                                      color: "var(--brand-on-primary)",
                                      letterSpacing: "0.045em",
                                    }
                                  : { letterSpacing: "0.045em" }
                              }
                            >
                              {category}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </header>

                {selectedItems.length > 0 && (
                  // section 전체 높이를 덮는 오버레이 안에서 sticky를 써야
                  // 실제로 스크롤될 때도 붙어있을 수 있다 (sticky는 자신을
                  // 담은 박스 높이를 벗어나 붙어있을 수 없어서, 높이 0인
                  // 박스 안에 넣으면 화면에 보이자마자 그냥 스크롤되어
                  // 사라져버린다 — 실측으로 확인함).
                  // pt-[55px]는 헤더 안에서 카테고리 칩 줄 아래쪽과 버튼의
                  // 아래쪽이 맞도록 맞춘 값. top-6은 대략 카테고리 줄이
                  // 화면 상단에 걸릴 때쯤 sticky가 붙기 시작하도록 맞춤.
                  <div className="pointer-events-none absolute inset-0 z-20">
                    <div className="sticky top-6 mx-auto flex max-w-[1280px] justify-end px-6 pt-[55px] sm:px-10 md:px-12 lg:px-16">
                      <div className="pointer-events-auto flex w-full max-w-md flex-col items-end gap-2 animate-in fade-in zoom-in-95 duration-200">
                        <button
                          type="button"
                          onClick={handleCommit}
                          disabled={isSubmitting}
                          className="flex w-full items-center justify-between gap-3 rounded-full px-5 py-3 shadow-lg transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                          style={{
                            backgroundColor: "var(--brand-primary)",
                            color: "var(--brand-on-primary)",
                          }}
                        >
                          <span className="flex items-center gap-2.5 overflow-hidden">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-black">
                              {selectedItems.length}
                            </span>
                            <span className="truncate text-sm font-medium opacity-90">
                              {selectedItems
                                .map((item) => item.name)
                                .join(", ")}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 text-base font-bold tracking-tight">
                            {isSubmitting ? "등록 중..." : copy.buttonOk}
                            <ArrowRight className="h-4 w-4" />
                          </span>
                        </button>
                        {error && (
                          <div className="w-full">
                            <ErrorText>{error}</ErrorText>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="px-6 pb-0.5 pt-2 sm:px-10 md:px-12 lg:px-16 animate-in fade-in fill-mode-backwards duration-1000 delay-100">
                  <div className="mx-auto max-w-[1280px]">
                    {error && <ErrorText>{error}</ErrorText>}

                    {filteredItems.length > 0 ? (
                      <div
                        className={cn(
                          "grid gap-2 auto-rows-fr",
                          getGridColsClass(config.kioskGridCols)
                        )}
                      >
                        {filteredItems.map((item, index) => (
                          <ContentCard
                            key={item.id}
                            item={item}
                            index={index}
                            selected={selectedItemIds.includes(item.id)}
                            fallbackImage={config.defaultItemImagePath}
                            onToggle={() => toggleContent(item)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-[50vh] items-center justify-center">
                        <div className="max-w-lg text-center">
                          <div className="mb-6 inline-block text-[10px] font-medium uppercase tracking-[0.3em] text-(--body-muted)">
                            Empty
                          </div>
                          <p
                            className="mb-3 font-light leading-tight tracking-tight text-(--brand-text)"
                            style={{
                              ...displayHeadingStyle,
                              fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
                            }}
                          >
                            {selectedCategory === "전체"
                              ? "현재 이용 가능한 컨텐츠가 없습니다."
                              : `${selectedCategory} 카테고리에 이용 가능한 컨텐츠가 없습니다.`}
                          </p>
                          <p className="text-base text-(--body-muted) sm:text-lg">
                            {selectedCategory === "전체"
                              ? "관리자에게 문의해주세요."
                              : "다른 카테고리를 선택해주세요."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </section>
            )}

            {step === "done" && (
              <section className="grid min-h-[60vh] content-center justify-items-center gap-8 text-center animate-in fade-in zoom-in-95 fill-mode-backwards duration-500">
                <span
                  className="flex h-20 w-20 items-center justify-center rounded-full text-(--brand-on-primary) shadow-xl"
                  style={{ backgroundColor: "var(--brand-primary)" }}
                >
                  <Check className="h-10 w-10" strokeWidth={3} />
                </span>
                <div>
                  <h2
                    className="text-5xl font-light leading-[1.05] tracking-[-0.02em] sm:text-6xl"
                    style={displayHeadingStyle}
                  >
                    {copy.doneTitle}
                  </h2>
                  {copy.doneSubtitle && (
                    <p className="mt-4 text-lg text-(--body-muted)">
                      {copy.doneSubtitle}
                    </p>
                  )}
                </div>
                {outcomes.length > 0 && (
                  <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                    {outcomes.map((o) => (
                      <span
                        key={o.itemId}
                        className="rounded-full px-4 py-2 text-sm font-semibold"
                        style={{
                          backgroundColor:
                            o.status === "queued"
                              ? "var(--brand-accent)"
                              : "var(--brand-primary)",
                          color: "var(--brand-on-primary)",
                        }}
                      >
                        {o.itemName}
                        {o.status === "started"
                          ? " · 이용 시작"
                          : o.status === "queued"
                          ? ` · 대기 ${o.queuePosition ?? ""}번${
                              o.maxWaitMinutes
                                ? ` (최대 약 ${o.maxWaitMinutes}분)`
                                : ""
                            }`
                          : ""}
                      </span>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  className="h-14 px-10 text-lg"
                  onClick={goHome}
                >
                  {copy.buttonRestart}
                </Button>
              </section>
            )}
          </div>
        </main>

        {/* ── 공통 브랜드 푸터 밴드 (smy 이식) ── */}
        <footer
          className="relative z-10 px-6 py-3 sm:px-12"
          style={{
            backgroundColor: "var(--brand-primary)",
            color: "var(--brand-on-primary)",
          }}
        >
          <div className="mx-auto flex max-w-[1280px] items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em]">
            <span>{config.orgName || "D.BASE"} · Playground</span>
            <span className="font-mono text-[10px] normal-case tracking-normal opacity-70">
              {FLOOR ? `F${FLOOR}` : ""}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function DbaseBackground({
  backgroundPath,
  backgroundType,
  visualMode,
  waveMode,
  paused,
  colorCore,
  colorFringe,
}: {
  backgroundPath: string | null;
  backgroundType: "image" | "video" | null;
  visualMode: "lava" | "aurora" | "wave" | "none";
  waveMode: WaveMode;
  paused: boolean;
  colorCore: string;
  colorFringe: string;
}) {
  return (
    <>
      {backgroundPath && (
        <div className="pointer-events-none fixed inset-0 z-0">
          {backgroundType === "video" ? (
            <video
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            >
              <source src={backgroundPath} />
            </video>
          ) : (
            <img
              src={backgroundPath}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {/* 음영 오버레이는 이미지 배경에만 적용 (동영상은 원본 그대로) */}
          {backgroundType !== "video" && (
            <div
              className="absolute inset-0 bg-(--brand-text)"
              style={{ opacity: "var(--bg-overlay-opacity)" }}
            />
          )}
        </div>
      )}
      {visualMode === "aurora" && (
        <AuroraBackground
          colorCore={colorCore}
          colorFringe={colorFringe}
          className="absolute inset-0 z-0"
          paused={paused}
        />
      )}
      {visualMode === "wave" && (
        <ParticleWaveBackground
          color={colorCore}
          mode={waveMode}
          className="absolute inset-0 z-0"
          paused={paused}
        />
      )}
      {visualMode === "lava" && (
        <div className="pointer-events-none absolute inset-0 z-0">
          <div
            className="absolute -left-[10%] -top-[10%] h-[60vw] w-[60vw] rounded-full blur-[160px] opacity-50"
            style={{ backgroundColor: "var(--brand-primary)" }}
          />
          <div
            className="absolute -bottom-[10%] -right-[10%] h-[60vw] w-[60vw] rounded-full blur-[180px] opacity-40"
            style={{ backgroundColor: "var(--brand-accent)" }}
          />
        </div>
      )}
    </>
  );
}

function EntryButton({
  icon,
  label,
  delayMs,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  delayMs: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${delayMs}ms`, animationDuration: "600ms" }}
      className="group flex min-h-44 items-center justify-between gap-4 rounded-3xl border border-(--hairline) bg-(--brand-bg)/70 px-8 py-7 text-left shadow-lg backdrop-blur-xl transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-(--hairline-strong) hover:shadow-xl active:scale-[0.99] animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards"
    >
      <span className="text-4xl font-semibold sm:text-5xl">{label}</span>
      <span
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105"
        style={{
          backgroundColor: "var(--brand-primary)",
          color: "var(--brand-on-primary)",
        }}
      >
        {icon}
      </span>
    </button>
  );
}

function Panel({
  title,
  children,
  footer,
  maxWidthClassName = "max-w-3xl",
}: {
  // eyebrow는 더 이상 렌더하지 않음(스텝 라벨 제거). prop은 호환 위해 optional로 유지.
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  // 컨텐츠가 좁은 스텝(예: PIN 입력)에서 박스 자체도 같이 좁히기 위한 오버라이드.
  maxWidthClassName?: string;
}) {
  return (
    <section
      className={cn(
        "mx-auto w-full rounded-3xl border border-(--hairline) bg-(--brand-bg)/70 p-6 shadow-xl backdrop-blur-2xl sm:p-10 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards duration-500",
        maxWidthClassName
      )}
    >
      <h2
        className="mb-8 text-4xl font-light leading-tight tracking-[-0.02em] sm:text-5xl"
        style={displayHeadingStyle}
      >
        {title}
      </h2>
      {children}
      {footer}
    </section>
  );
}

// 라벨 문자열 중 특정 부분만 강조 표시. target이 없으면 원문 그대로 반환.
function highlightSubstring(
  text: string,
  target: string,
  className: string
): React.ReactNode {
  const index = text.indexOf(target);
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <span className={className}>{target}</span>
      {text.slice(index + target.length)}
    </>
  );
}

function Field({
  label,
  labelClassName,
  children,
}: {
  label: React.ReactNode;
  labelClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span
        className={
          labelClassName ??
          "text-xs font-semibold uppercase tracking-[0.14em] text-(--body-muted)"
        }
      >
        {label}
      </span>
      {children}
    </label>
  );
}

// 버튼/Select 그룹용 — label로 감싸면 첫 컨트롤이 오작동하므로 div 사용
function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-(--body-muted)">
        {label}
      </span>
      {children}
    </div>
  );
}

function FlowFooter({
  backLabel,
  nextLabel,
  onBack,
  onNext,
  disabled,
}: {
  backLabel: string;
  nextLabel: string;
  onBack: () => void;
  onNext: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-8 flex justify-end gap-3">
      <Button
        type="button"
        variant="outline"
        className="h-12 px-6"
        onClick={onBack}
      >
        {backLabel}
      </Button>
      <Button
        type="button"
        className="h-12 px-8"
        onClick={onNext}
        disabled={disabled}
      >
        {nextLabel}
      </Button>
    </div>
  );
}

function Counter({
  label,
  value,
  accent,
  onMinus,
  onPlus,
}: {
  label: string;
  value: number;
  accent?: boolean;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-(--surface-card) p-4",
        accent ? "border-(--brand-primary)" : "border-(--hairline)"
      )}
    >
      <div className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-(--body-muted)">
        {label}
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={onMinus}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-10 text-center text-3xl font-light tabular-nums">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={onPlus}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ContentCard({
  item,
  index,
  selected,
  fallbackImage,
  onToggle,
}: {
  item: Item;
  index: number;
  selected: boolean;
  fallbackImage: string | null;
  onToggle: () => void;
}) {
  const imageSrc = item.imageUrl ?? fallbackImage ?? youthFacilityImage;

  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        animationDelay: `${Math.min(index * 40, 600)}ms`,
        animationDuration: "500ms",
      }}
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-lg border bg-(--surface-card) text-left transition-[border-color,transform,box-shadow] duration-300 active:scale-[0.99] animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards",
        selected
          ? "border-(--brand-primary) ring-2 ring-(--brand-primary)"
          : "border-(--hairline) hover:border-(--hairline-strong)"
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={imageSrc}
          alt={item.name}
          fill
          className="object-cover transition-opacity duration-500"
        />
        <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase"
            style={{
              backgroundColor: "var(--brand-primary)",
              color: "var(--brand-on-primary)",
              letterSpacing: "0.045em",
            }}
          >
            가능
          </span>
        </div>
        {selected && (
          <div className="absolute inset-0 flex items-center justify-center bg-(--brand-primary)/15">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full text-(--brand-on-primary) shadow-lg"
              style={{ backgroundColor: "var(--brand-primary)" }}
            >
              <Check className="h-6 w-6" strokeWidth={3} />
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-0.5 px-4 py-2">
        <span className="truncate text-sm font-semibold leading-tight text-(--brand-text) sm:text-base">
          {item.name}
        </span>
        <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-(--body-muted)">
          <span>{item.category}</span>
        </div>
      </div>
    </button>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mt-4 text-sm font-semibold"
      style={{ color: "var(--brand-accent)" }}
    >
      {children}
    </p>
  );
}
