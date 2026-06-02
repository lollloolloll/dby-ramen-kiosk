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
import bearImage from "@/assets/images/bear.png";
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
import { findUsersByNameAndPin } from "@/lib/actions/generalUser";
import { commitDbaseVisit, registerDbaseUser } from "@/lib/actions/dbase";
import {
  assertValidHeadcount,
  type DbaseHeadcount,
} from "@/lib/dbase/headcount";
import { mergeDbaseCopy } from "@/lib/dbase/copy";
import { resolveVisualMode, resolveWaveMode } from "@/lib/theme/visual-mode";
import { cn } from "@/lib/utils";

type Step =
  | "entry"
  | "register"
  | "identify"
  | "mismatch"
  | "headcount"
  | "contents"
  | "confirm"
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

// smy 디스플레이 헤드라인 레시피 (var(--font-display) + 가변 weight 300 + 타이트 트래킹)
const displayHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 300, "opsz" 60',
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

// 학교 선택 — smy RentalDialog 모달과 동일한 데이터/규칙 (도봉구 인근 학교)
const SCHOOL_LEVELS = [
  "초등학교",
  "중학교",
  "고등학교",
  "대학교",
  "해당없음",
] as const;

const SCHOOL_DATA: Record<string, string[]> = {
  초등학교: [
    "가인초",
    "노일초",
    "노원초",
    "누원초",
    "도봉초",
    "동북초",
    "방학초",
    "백운초",
    "상경초",
    "상원초",
    "수락초",
    "숭미초",
    "신방학초",
    "신학초",
    "신창초",
    "신화초",
    "쌍문초",
    "오봉초",
    "월천초",
    "자운초",
    "창경초",
    "창도초",
    "창동초",
    "창림초",
    "창원초",
    "창일초",
    "초당초",
    "한신초",
  ],
  중학교: [
    "노곡중",
    "도봉중",
    "방학중",
    "백운중",
    "북서울중",
    "상경중",
    "상원중",
    "선덕중",
    "신도봉중",
    "신방학중",
    "정의여중",
    "창동중",
    "창북중",
    "창일중",
    "효문중",
  ],
  고등학교: [
    "누원고",
    "서울문화고",
    "서울외고",
    "선덕고",
    "세그루패션고",
    "수락고",
    "자운고",
    "정의여고",
    "창동고",
    "효문고",
  ],
  대학교: [
    "광운대",
    "삼육대",
    "인덕대",
    "이화여대",
    "남서울대",
    "서일대",
    "서울과기대",
    "서울여대",
    "신한대",
    "덕성여대",
  ],
};

const getSchoolSuffix = (level: string) => {
  switch (level) {
    case "초등학교":
      return "초";
    case "중학교":
      return "중";
    case "고등학교":
      return "고";
    case "대학교":
      return "대";
    default:
      return "";
  }
};

const buildSchoolValue = (level: string, name: string) => {
  const trimmedName = name.trim().replace(/\s/g, "");
  if (level === "해당없음") return "해당없음";
  if (!trimmedName) return "";
  const suffix = getSchoolSuffix(level);
  if (suffix && trimmedName.endsWith(suffix)) return trimmedName;
  return `${trimmedName}${suffix}`;
};

export function DbaseKioskFlow({ items }: { items: Item[] }) {
  const config = useTheme();
  const copy = mergeDbaseCopy(config.dbaseCopy);
  const isPreview = usePreviewMode();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [step, setStep] = useState<Step>("entry");
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [identifyName, setIdentifyName] = useState("");
  const [identifyPin, setIdentifyPin] = useState("");
  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    name: "",
    phoneNumber: "",
    gender: "",
    birthDate: "",
    school: "",
    personalInfoConsent: false,
  });
  // 생년월일(년/월/일 분리) · 학교(교급/이름) 보조 상태 — smy 모달 패턴
  const [birthYear, setBirthYear] = useState<string>();
  const [birthMonth, setBirthMonth] = useState<string>();
  const [birthDay, setBirthDay] = useState<string>();
  const [schoolLevel, setSchoolLevel] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [isDirectInput, setIsDirectInput] = useState(false);
  const [showSchoolPanel, setShowSchoolPanel] = useState(false);
  const [registerAttempted, setRegisterAttempted] = useState(false);
  const [headcount, setHeadcount] = useState<DbaseHeadcount>(emptyHeadcount);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [doneContents, setDoneContents] = useState<string[]>([]);
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

  // 진입점·키오스크 전 스텝이 동일한 배경(셰이더)을 공유하도록, smy/홈과 같은
  // 우선순위로 visualMode를 결정한다. fallback도 홈·smy와 동일하게 "lava"로 맞춤.
  const visualMode = resolveVisualMode(config, searchParams, "lava");
  const waveMode: WaveMode = resolveWaveMode(searchParams);

  const resetFlow = () => {
    setStep("entry");
    setVisitor(null);
    setIdentifyName("");
    setIdentifyPin("");
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
    setSchoolLevel("");
    setSchoolName("");
    setIsDirectInput(false);
    setShowSchoolPanel(false);
    setRegisterAttempted(false);
    setHeadcount(emptyHeadcount);
    setSelectedItemIds([]);
    setDoneContents([]);
    setError("");
    setIsSubmitting(false);
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
    const timeout = setTimeout(resetFlow, 8000);
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
    if (!identifyName.trim() || pin.length !== 4) {
      setError("이름과 전화번호 가운데 4자리를 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await findUsersByNameAndPin(identifyName, pin);
      if (result.status === "single_match") {
        setVisitor({ id: result.user.id, name: result.user.name });
        setStep("headcount");
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
  const registerFieldErrors = {
    name: registerForm.name.trim().length === 0,
    phoneNumber: !/^010-\d{4}-\d{4}$/.test(registerForm.phoneNumber),
    gender: registerForm.gender === "",
    birthDate: !/^\d{4}-\d{1,2}-\d{1,2}$/.test(registerForm.birthDate),
    school: registerForm.school.trim().length === 0,
  };

  const handleRegister = async () => {
    setError("");
    if (Object.values(registerFieldErrors).some(Boolean)) {
      setRegisterAttempted(true);
      setError("표시된 항목을 확인해주세요.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await registerDbaseUser(registerForm);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setVisitor(result.user);
      setRegisterAttempted(false);
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
      setDoneContents(result.data.contents);
      setStep("done");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedItems = items.filter((item) =>
    selectedItemIds.includes(item.id)
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-(--brand-bg)">
      <DbaseBackground
        backgroundPath={config.backgroundPath}
        backgroundType={config.backgroundType}
        visualMode={visualMode}
        waveMode={waveMode}
        paused={isPreview}
        colorCore={config.colorPrimary}
        colorFringe={config.colorAccent}
      />

      <div
        className="relative z-10 flex min-h-screen flex-col text-(--brand-text)"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {/* ── 공통 다크 네비 밴드 (smy 이식) — 전 스텝 동일 chrome ── */}
        <nav className="relative z-20 flex h-12 items-center justify-between bg-brand-text px-6 text-(--brand-bg) sm:px-12 animate-in fade-in slide-in-from-top-1 fill-mode-backwards duration-500">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => {
                if (!isPreview) resetFlow();
              }}
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

        {/* ── 스텝 컨텐츠 — 투명 캔버스 위. 배경 셰이더가 전 스텝에서 동일하게 보임 ── */}
        <main className="relative z-10 flex flex-1 items-center px-5 py-10 sm:px-12 sm:py-14">
          <div
            className={cn(
              "mx-auto w-full",
              step === "contents" ? "max-w-[1280px]" : "max-w-5xl"
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
                  <FlowFooter
                    backLabel={copy.buttonRestart}
                    nextLabel={copy.buttonOk}
                    onBack={() => setStep("entry")}
                    onNext={handleRegister}
                    disabled={isSubmitting}
                  />
                }
              >
                <div className="grid gap-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={copy.fieldName}>
                      <Input
                        value={registerForm.name}
                        autoComplete="off"
                        autoCorrect="off"
                        lang="ko"
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
                            phoneNumber: formatPhoneNumber(event.target.value),
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

                  <FieldGroup label="학교">
                    <div
                      className={cn(
                        "grid grid-cols-3 gap-2 rounded-2xl sm:grid-cols-5",
                        registerAttempted &&
                          registerFieldErrors.school &&
                          "p-1 ring-2 ring-red-500/40"
                      )}
                    >
                      {SCHOOL_LEVELS.map((level) => (
                        <Button
                          key={level}
                          type="button"
                          variant={
                            schoolLevel === level ? "default" : "outline"
                          }
                          className="h-12"
                          onClick={() => {
                            setSchoolLevel(level);
                            setIsDirectInput(false);
                            setSchoolName("");
                            if (level === "해당없음") {
                              setShowSchoolPanel(false);
                              setRegisterForm((c) => ({
                                ...c,
                                school: "해당없음",
                              }));
                            } else {
                              setRegisterForm((c) => ({ ...c, school: "" }));
                              setShowSchoolPanel(true);
                            }
                          }}
                        >
                          {level}
                        </Button>
                      ))}
                    </div>

                    {registerForm.school && (
                      <button
                        type="button"
                        onClick={() => {
                          if (schoolLevel && schoolLevel !== "해당없음")
                            setShowSchoolPanel(true);
                        }}
                        className="mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-(--brand-primary) px-4 py-1.5 text-sm font-semibold text-(--brand-on-primary)"
                      >
                        {registerForm.school}
                        {schoolLevel && schoolLevel !== "해당없음" && (
                          <span className="text-xs opacity-70">· 변경</span>
                        )}
                      </button>
                    )}

                    {/* 학교 선택 드로어(옆 모달) — 교급 선택 시 열림. 이 영역만 스크롤 */}
                    {showSchoolPanel &&
                      schoolLevel &&
                      schoolLevel !== "해당없음" && (
                        <>
                          <div
                            className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-200"
                            onClick={() => setShowSchoolPanel(false)}
                          />
                          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-(--brand-bg) p-6 text-(--brand-text) shadow-2xl animate-in slide-in-from-right duration-300">
                            <div className="mb-4 flex items-center justify-between">
                              <h3
                                className="text-2xl font-light"
                                style={displayHeadingStyle}
                              >
                                {schoolLevel}
                              </h3>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowSchoolPanel(false)}
                              >
                                ✕
                              </Button>
                            </div>
                            <div className="flex-1 overflow-y-auto pr-1 scrollbar-hidden">
                              <div className="grid grid-cols-2 gap-2">
                                {(SCHOOL_DATA[schoolLevel] ?? []).map(
                                  (school) => {
                                    const selected =
                                      !isDirectInput && schoolName === school;
                                    return (
                                      <Button
                                        key={school}
                                        type="button"
                                        variant={
                                          selected ? "default" : "outline"
                                        }
                                        className="h-14"
                                        onClick={() => {
                                          setIsDirectInput(false);
                                          setSchoolName(school);
                                          setRegisterForm((c) => ({
                                            ...c,
                                            school: buildSchoolValue(
                                              schoolLevel,
                                              school
                                            ),
                                          }));
                                          setShowSchoolPanel(false);
                                        }}
                                      >
                                        {school}
                                      </Button>
                                    );
                                  }
                                )}
                                <Button
                                  type="button"
                                  variant={
                                    isDirectInput ? "default" : "outline"
                                  }
                                  className="h-14 border-dashed"
                                  onClick={() => {
                                    setIsDirectInput(true);
                                    setSchoolName("");
                                    setRegisterForm((c) => ({
                                      ...c,
                                      school: "",
                                    }));
                                  }}
                                >
                                  ✎ 직접 입력
                                </Button>
                              </div>
                            </div>
                            {isDirectInput && (
                              <div className="mt-4 flex gap-2 border-t border-(--hairline) pt-4">
                                <Input
                                  autoComplete="off"
                                  autoCorrect="off"
                                  lang="ko"
                                  placeholder="학교 이름 (예: 선덕)"
                                  value={schoolName}
                                  onChange={(event) => {
                                    const val = event.target.value.replace(
                                      /\s/g,
                                      ""
                                    );
                                    setSchoolName(val);
                                    setRegisterForm((c) => ({
                                      ...c,
                                      school: buildSchoolValue(
                                        schoolLevel,
                                        val
                                      ),
                                    }));
                                  }}
                                  className="h-12 flex-1 text-base"
                                />
                                <Button
                                  type="button"
                                  onClick={() => {
                                    if (schoolName) setShowSchoolPanel(false);
                                  }}
                                >
                                  완료
                                </Button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
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
              </Panel>
            )}

            {step === "identify" && (
              <Panel
                eyebrow={copy.identifyEyebrow}
                title={copy.identifyTitle}
                footer={
                  <FlowFooter
                    backLabel={copy.buttonRestart}
                    nextLabel={copy.buttonOk}
                    onBack={() => setStep("entry")}
                    onNext={handleIdentify}
                    disabled={isSubmitting}
                  />
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={copy.fieldName}>
                    <Input
                      value={identifyName}
                      onChange={(event) => setIdentifyName(event.target.value)}
                      className="h-14 text-lg"
                    />
                  </Field>
                  <Field label={copy.fieldPin}>
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      value={identifyPin}
                      onChange={(event) =>
                        setIdentifyPin(event.target.value.replace(/[^\d]/g, ""))
                      }
                      className="h-14 text-lg tracking-[0.5em]"
                    />
                  </Field>
                </div>
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
                    onClick={() => setStep("identify")}
                  >
                    {copy.mismatchRetry}
                  </Button>
                  <Button
                    type="button"
                    className="h-14 text-lg"
                    onClick={() => setStep("register")}
                  >
                    {copy.mismatchRegister}
                  </Button>
                </div>
              </Panel>
            )}

            {step === "headcount" && (
              <Panel
                eyebrow={visitor?.name ?? copy.headcountEyebrowFallback}
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
              <section className="pb-28">
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-(--body-muted)">
                      {copy.contentsEyebrow}
                    </p>
                    <h2
                      className="text-4xl font-light leading-[1.05] tracking-[-0.02em] sm:text-5xl"
                      style={displayHeadingStyle}
                    >
                      {copy.contentsTitle}
                    </h2>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 px-6"
                    onClick={() => setStep("headcount")}
                  >
                    {copy.buttonBack}
                  </Button>
                </div>

                {error && <ErrorText>{error}</ErrorText>}

                <div className="grid grid-cols-2 gap-4 auto-rows-fr sm:gap-5 lg:grid-cols-4">
                  {items.map((item, index) => (
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

                {/* 하단 플로팅 확정 바 (smy 카트바 이식) — 1개 이상 선택 시 등장 */}
                {selectedItems.length > 0 && (
                  <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-5 animate-in slide-in-from-bottom-4 fade-in duration-300">
                    <button
                      type="button"
                      onClick={() => setStep("confirm")}
                      className="flex w-full max-w-[1280px] items-center justify-between gap-4 rounded-2xl px-6 py-4 shadow-2xl transition-transform active:scale-[0.99]"
                      style={{
                        backgroundColor: "var(--brand-primary)",
                        color: "var(--brand-on-primary)",
                      }}
                    >
                      <span className="flex items-center gap-3 overflow-hidden">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-base font-black">
                          {selectedItems.length}
                        </span>
                        <span className="truncate text-sm font-medium opacity-90">
                          {selectedItems.map((item) => item.name).join(", ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-lg font-bold tracking-tight">
                        {copy.buttonOk}
                        <ArrowRight className="h-5 w-5" />
                      </span>
                    </button>
                  </div>
                )}
              </section>
            )}

            {step === "confirm" && (
              <Panel
                eyebrow={visitor?.name ?? copy.headcountEyebrowFallback}
                title="이대로 등록할까?"
                footer={
                  <FlowFooter
                    backLabel={copy.buttonBack}
                    nextLabel={isSubmitting ? "등록 중..." : "등록"}
                    onBack={() => setStep("contents")}
                    onNext={handleCommit}
                    disabled={isSubmitting}
                  />
                }
              >
                <div className="grid gap-5">
                  <div className="rounded-2xl border border-(--hairline) bg-(--brand-bg)/40 p-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-(--body-muted)">
                      인원
                    </p>
                    <p className="text-lg">
                      {copy.countTotal}{" "}
                      <span className="font-semibold">
                        {headcount.totalCount}
                      </span>
                      명
                      <span className="text-(--body-muted)">
                        {" · "}청소년{" "}
                        {headcount.youthMale + headcount.youthFemale} · 성인{" "}
                        {headcount.adultMale + headcount.adultFemale}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-2xl border border-(--hairline) bg-(--brand-bg)/40 p-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-(--body-muted)">
                      {copy.contentsEyebrow}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedItems.map((item) => (
                        <span
                          key={item.id}
                          className="rounded-full px-4 py-2 text-sm font-semibold"
                          style={{
                            backgroundColor: "var(--brand-primary)",
                            color: "var(--brand-on-primary)",
                          }}
                        >
                          {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  {error && <ErrorText>{error}</ErrorText>}
                </div>
              </Panel>
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
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-(--body-muted)">
                    {copy.doneEyebrow}
                  </p>
                  <h2
                    className="text-5xl font-light leading-[1.05] tracking-[-0.02em] sm:text-6xl"
                    style={displayHeadingStyle}
                  >
                    {copy.doneTitle}
                  </h2>
                  <p className="mt-4 text-lg text-(--body-muted)">
                    {copy.doneSubtitle}
                  </p>
                </div>
                {doneContents.length > 0 && (
                  <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                    {doneContents.map((content) => (
                      <span
                        key={content}
                        className="rounded-full px-4 py-2 text-sm font-semibold"
                        style={{
                          backgroundColor: "var(--brand-primary)",
                          color: "var(--brand-on-primary)",
                        }}
                      >
                        {content}
                      </span>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  className="h-14 px-10 text-lg"
                  onClick={resetFlow}
                >
                  {copy.buttonRestart}
                </Button>
              </section>
            )}
          </div>
        </main>

        {/* ── 공통 브랜드 푸터 밴드 (smy 이식) ── */}
        <footer
          className="relative z-10 px-6 py-5 sm:px-12"
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
      <span className="text-3xl font-semibold sm:text-4xl">{label}</span>
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
  eyebrow,
  title,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-3xl rounded-3xl border border-(--hairline) bg-(--brand-bg)/70 p-6 shadow-xl backdrop-blur-2xl sm:p-10 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards duration-500">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-(--body-muted)">
        {eyebrow}
      </p>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-(--body-muted)">
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
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" size="icon" onClick={onMinus}>
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-10 text-center text-4xl font-light tabular-nums">
          {value}
        </span>
        <Button type="button" variant="outline" size="icon" onClick={onPlus}>
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
  const imageSrc = item.imageUrl ?? fallbackImage ?? bearImage;

  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        animationDelay: `${Math.min(index * 40, 600)}ms`,
        animationDuration: "500ms",
      }}
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-(--surface-card) text-left transition-[border-color,transform] duration-300 active:scale-[0.99] animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards",
        selected
          ? "border-(--brand-primary) ring-2 ring-(--brand-primary)"
          : "border-(--hairline) hover:border-(--hairline-strong)"
      )}
    >
      <div className="relative aspect-square overflow-hidden">
        <Image src={imageSrc} alt={item.name} fill className="object-cover" />
        {selected && (
          <div className="absolute inset-0 flex items-center justify-center bg-(--brand-primary)/15">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full text-(--brand-on-primary) shadow-lg"
              style={{ backgroundColor: "var(--brand-primary)" }}
            >
              <Check className="h-7 w-7" strokeWidth={3} />
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-4 py-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-(--body-muted)">
          {item.category}
        </span>
        <span className="line-clamp-2 text-base font-semibold leading-tight sm:text-lg">
          {item.name}
        </span>
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
