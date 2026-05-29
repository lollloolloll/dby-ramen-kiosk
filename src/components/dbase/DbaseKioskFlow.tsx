"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Minus,
  Plus,
  RotateCcw,
  UserPlus,
  Users,
} from "lucide-react";
import type { Item } from "@/app/(admin)/admin/items/columns";
import { AuroraBackground } from "@/components/visuals/AuroraBackground";
import {
  ParticleWaveBackground,
  type WaveMode,
} from "@/components/visuals/ParticleWaveBackground";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { usePreviewMode } from "@/lib/hooks/usePreviewMode";
import { findUsersByNameAndPin } from "@/lib/actions/generalUser";
import { commitDbaseVisit, registerDbaseUser } from "@/lib/actions/dbase";
import {
  assertValidHeadcount,
  type DbaseHeadcount,
} from "@/lib/dbase/headcount";
import { resolveVisualMode, resolveWaveMode } from "@/lib/theme/visual-mode";
import { cn } from "@/lib/utils";

type Step = "entry" | "register" | "identify" | "mismatch" | "headcount" | "contents" | "done";

type Visitor = {
  id: number;
  name: string;
};

type RegisterForm = {
  name: string;
  phoneNumber: string;
  gender: "" | "남" | "여";
  birthDate: string;
  personalInfoConsent: boolean;
};

const FLOOR = process.env.NEXT_PUBLIC_FLOOR;

const emptyHeadcount: DbaseHeadcount = {
  totalCount: 1,
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

export function DbaseKioskFlow({ items }: { items: Item[] }) {
  const config = useTheme();
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
    personalInfoConsent: false,
  });
  const [headcount, setHeadcount] = useState<DbaseHeadcount>(emptyHeadcount);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [doneContents, setDoneContents] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const visualMode = resolveVisualMode(config, searchParams, "aurora");
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
      personalInfoConsent: false,
    });
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
      router.push("/");
    }, config.inactivityTimeoutMs);
  };

  useEffect(() => {
    if (isPreview) return;
    const events = ["mousedown", "mousemove", "keypress", "touchstart", "click"] as const;
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
    setHeadcount((current) => ({
      ...current,
      [key]: Math.max(0, current[key] + delta),
    }));
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
        event instanceof Error ? event.message : "사용자 확인 중 오류가 발생했습니다."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async () => {
    setError("");
    setIsSubmitting(true);
    try {
      const result = await registerDbaseUser(registerForm);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setVisitor(result.user);
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
      setError(event instanceof Error ? event.message : "인원 수를 확인해주세요.");
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

      <div className="relative z-10 flex min-h-screen flex-col text-(--brand-text)">
        <header className="flex h-14 items-center justify-between px-6 sm:px-10">
          <Link
            href="/"
            onClick={(event) => {
              if (isPreview) event.preventDefault();
            }}
            className="text-xs font-semibold uppercase tracking-[0.18em] text-(--brand-text)/60"
          >
            Home
          </Link>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-(--brand-text)/45">
            {FLOOR ? `Floor ${FLOOR}` : "Playground"}
          </div>
        </header>

        <main className="flex flex-1 items-center px-5 py-8 sm:px-10">
          <div className="mx-auto w-full max-w-6xl">
            {step === "entry" && (
              <section className="grid min-h-[70vh] content-center gap-10">
                <div className="max-w-3xl">
                  <p className="mb-4 text-sm font-semibold uppercase tracking-[0.28em] text-(--body-muted)">
                    도봉동청소년문화의집 플레이그라운드
                  </p>
                  <h1
                    className="text-5xl font-light leading-[1.05] sm:text-7xl"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    두둥~ D.BASE 입장!
                  </h1>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <EntryButton
                    icon={<UserPlus className="h-8 w-8" />}
                    label="처음 왔어요"
                    onClick={() => setStep("register")}
                  />
                  <EntryButton
                    icon={<RotateCcw className="h-8 w-8" />}
                    label="또 왔어요"
                    onClick={() => setStep("identify")}
                  />
                </div>
              </section>
            )}

            {step === "register" && (
              <Panel
                eyebrow="처음 왔어요"
                title="처음 온 두리, 반가워~"
                footer={
                  <FlowFooter
                    backLabel="처음으로"
                    nextLabel="OK"
                    onBack={() => setStep("entry")}
                    onNext={handleRegister}
                    disabled={isSubmitting}
                  />
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="이름">
                    <Input
                      value={registerForm.name}
                      onChange={(event) =>
                        setRegisterForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="h-14 text-lg"
                    />
                  </Field>
                  <Field label="연락처">
                    <Input
                      inputMode="numeric"
                      value={registerForm.phoneNumber}
                      onChange={(event) =>
                        setRegisterForm((current) => ({
                          ...current,
                          phoneNumber: formatPhoneNumber(event.target.value),
                        }))
                      }
                      placeholder="010-0000-0000"
                      className="h-14 text-lg"
                    />
                  </Field>
                  <Field label="성별">
                    <div className="grid grid-cols-2 gap-3">
                      {(["남", "여"] as const).map((gender) => (
                        <Button
                          key={gender}
                          type="button"
                          variant={
                            registerForm.gender === gender ? "default" : "outline"
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
                  </Field>
                  <Field label="생년월일">
                    <Input
                      type="date"
                      value={registerForm.birthDate}
                      onChange={(event) =>
                        setRegisterForm((current) => ({
                          ...current,
                          birthDate: event.target.value,
                        }))
                      }
                      className="h-14 text-lg"
                    />
                  </Field>
                </div>
                <label className="mt-6 flex items-center gap-3 rounded-lg border border-(--hairline) px-4 py-4 text-base">
                  <Checkbox
                    checked={registerForm.personalInfoConsent}
                    onCheckedChange={(checked) =>
                      setRegisterForm((current) => ({
                        ...current,
                        personalInfoConsent: checked === true,
                      }))
                    }
                  />
                  개인정보 수집 및 이용에 동의합니다
                </label>
                {error && <ErrorText>{error}</ErrorText>}
              </Panel>
            )}

            {step === "identify" && (
              <Panel
                eyebrow="또 왔어요"
                title="오늘도 반가워!"
                footer={
                  <FlowFooter
                    backLabel="처음으로"
                    nextLabel="OK"
                    onBack={() => setStep("entry")}
                    onNext={handleIdentify}
                    disabled={isSubmitting}
                  />
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="이름">
                    <Input
                      value={identifyName}
                      onChange={(event) => setIdentifyName(event.target.value)}
                      className="h-14 text-lg"
                    />
                  </Field>
                  <Field label="전화번호 가운데 4자리">
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      value={identifyPin}
                      onChange={(event) =>
                        setIdentifyPin(event.target.value.replace(/[^\d]/g, ""))
                      }
                      className="h-14 text-lg"
                    />
                  </Field>
                </div>
                {error && <ErrorText>{error}</ErrorText>}
              </Panel>
            )}

            {step === "mismatch" && (
              <Panel eyebrow="확인 필요" title="입력하신 정보가 일치하지 않아요">
                <p className="text-xl text-(--body-muted)">혹시 처음 왔니?</p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 text-lg"
                    onClick={() => setStep("identify")}
                  >
                    다시 입력
                  </Button>
                  <Button
                    type="button"
                    className="h-14 text-lg"
                    onClick={() => setStep("register")}
                  >
                    신규 등록
                  </Button>
                </div>
              </Panel>
            )}

            {step === "headcount" && (
              <Panel
                eyebrow={visitor?.name ?? "D.BASE"}
                title="몇 명이 왔어?"
                footer={
                  <FlowFooter
                    backLabel="이전"
                    nextLabel="OK"
                    onBack={() => setStep("entry")}
                    onNext={handleHeadcountNext}
                  />
                }
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <Counter
                    label="총"
                    value={headcount.totalCount}
                    onMinus={() => updateHeadcount("totalCount", -1)}
                    onPlus={() => updateHeadcount("totalCount", 1)}
                  />
                  <Counter
                    label="청소년 남"
                    value={headcount.youthMale}
                    onMinus={() => updateHeadcount("youthMale", -1)}
                    onPlus={() => updateHeadcount("youthMale", 1)}
                  />
                  <Counter
                    label="청소년 여"
                    value={headcount.youthFemale}
                    onMinus={() => updateHeadcount("youthFemale", -1)}
                    onPlus={() => updateHeadcount("youthFemale", 1)}
                  />
                  <Counter
                    label="성인 남"
                    value={headcount.adultMale}
                    onMinus={() => updateHeadcount("adultMale", -1)}
                    onPlus={() => updateHeadcount("adultMale", 1)}
                  />
                  <Counter
                    label="성인 여"
                    value={headcount.adultFemale}
                    onMinus={() => updateHeadcount("adultFemale", -1)}
                    onPlus={() => updateHeadcount("adultFemale", 1)}
                  />
                </div>
                {error && <ErrorText>{error}</ErrorText>}
              </Panel>
            )}

            {step === "contents" && (
              <section className="py-4">
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-(--body-muted)">
                      하고 싶은 것 모두 선택
                    </p>
                    <h2
                      className="text-4xl font-light sm:text-5xl"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      두근두근, 오늘은 뭐해?
                    </h2>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 px-6"
                      onClick={() => setStep("headcount")}
                    >
                      이전
                    </Button>
                    <Button
                      type="button"
                      className="h-12 px-6"
                      onClick={handleCommit}
                      disabled={isSubmitting}
                    >
                      OK
                    </Button>
                  </div>
                </div>

                {error && <ErrorText>{error}</ErrorText>}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {items.map((item) => {
                    const selected = selectedItemIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleContent(item)}
                        className={cn(
                          "relative flex min-h-36 flex-col justify-between rounded-lg border bg-(--surface-card) p-5 text-left transition active:scale-[0.99]",
                          selected
                            ? "border-(--brand-primary) ring-2 ring-(--brand-primary)"
                            : "border-(--hairline) hover:border-(--hairline-strong)"
                        )}
                      >
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-(--body-muted)">
                          {item.category}
                        </span>
                        <span className="text-2xl font-semibold leading-tight">
                          {item.name}
                        </span>
                        {selected && (
                          <span className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-(--brand-primary) text-(--brand-on-primary)">
                            <Check className="h-5 w-5" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {step === "done" && (
              <Panel eyebrow="Welcome" title="Welcome to D.BASE!">
                <div className="mt-2 flex items-center gap-3 text-xl text-(--body-muted)">
                  <Users className="h-6 w-6" />
                  도봉동청소년문화의집 플레이그라운드 등록
                </div>
                <div className="mt-8 flex flex-wrap gap-2">
                  {doneContents.map((content) => (
                    <span
                      key={content}
                      className="rounded-full bg-(--brand-primary) px-4 py-2 text-sm font-semibold text-(--brand-on-primary)"
                    >
                      {content}
                    </span>
                  ))}
                </div>
                <Button type="button" className="mt-10 h-14 px-8 text-lg" onClick={resetFlow}>
                  처음으로
                </Button>
              </Panel>
            )}
          </div>
        </main>
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
          <div
            className="absolute inset-0 bg-(--brand-bg)"
            style={{ opacity: "var(--bg-overlay-opacity)" }}
          />
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
            className="absolute -left-[10%] -top-[10%] h-[60vw] w-[60vw] rounded-full blur-[160px] opacity-30"
            style={{ backgroundColor: "var(--brand-primary)" }}
          />
          <div
            className="absolute -bottom-[10%] -right-[10%] h-[60vw] w-[60vw] rounded-full blur-[180px] opacity-25"
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
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-40 items-center justify-between rounded-lg border border-(--hairline) bg-(--surface-card) px-8 text-left transition active:scale-[0.99]"
    >
      <span className="text-3xl font-semibold">{label}</span>
      <span className="text-(--brand-primary)">{icon}</span>
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
    <section className="mx-auto max-w-4xl rounded-lg border border-(--hairline) bg-(--brand-bg)/95 p-6 shadow-sm sm:p-10">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-(--body-muted)">
        {eyebrow}
      </p>
      <h2
        className="mb-8 text-4xl font-light leading-tight sm:text-5xl"
        style={{ fontFamily: "var(--font-display)" }}
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
      <span className="text-sm font-semibold text-(--body-muted)">{label}</span>
      {children}
    </label>
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
      <Button type="button" variant="outline" className="h-12 px-6" onClick={onBack}>
        {backLabel}
      </Button>
      <Button type="button" className="h-12 px-8" onClick={onNext} disabled={disabled}>
        {nextLabel}
      </Button>
    </div>
  );
}

function Counter({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: number;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="rounded-lg border border-(--hairline) bg-(--surface-card) p-4">
      <div className="mb-4 text-sm font-semibold text-(--body-muted)">{label}</div>
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" size="icon" onClick={onMinus}>
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-10 text-center text-4xl font-light">{value}</span>
        <Button type="button" variant="outline" size="icon" onClick={onPlus}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-sm font-semibold text-red-600">{children}</p>;
}
