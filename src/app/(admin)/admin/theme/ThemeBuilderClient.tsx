"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useFieldArray, useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, RefreshCcw, RotateCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateSiteConfig } from "@/lib/actions/siteConfig";
import {
  defaultSiteConfigValues,
  siteConfigSchema,
  type SiteConfig,
  type SiteConfigInput,
} from "@/lib/schemas/siteConfig";
import { useDebounce } from "@/lib/shared/use-debounce";

const PREVIEW_TABS = {
  home: "/?preview=1",
  kiosk: "/kiosk?preview=1",
} as const;

const DEVICE_PRESETS = {
  ipad: { label: "iPad", width: 1024, height: 768 },
  ipadPro11: { label: "iPad Pro 11\"", width: 1194, height: 834 },
  ipadPro13: { label: "iPad Pro 13\"", width: 1366, height: 1024 },
  iphone: { label: "iPhone 14 Pro", width: 393, height: 852 },
  desktop: { label: "Desktop", width: 1440, height: 900 },
} as const;

type DevicePresetKey = keyof typeof DEVICE_PRESETS;

export function ThemeBuilderClient({ initialConfig }: { initialConfig: SiteConfig }) {
  const [activePreview, setActivePreview] = useState<keyof typeof PREVIEW_TABS>("home");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [device, setDevice] = useState<DevicePresetKey>("ipad");
  const [isRotated, setIsRotated] = useState(false);
  const [zoom, setZoom] = useState(0.75);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const preset = DEVICE_PRESETS[device];
  const frameWidth = isRotated ? preset.height : preset.width;
  const frameHeight = isRotated ? preset.width : preset.height;

  const form = useForm<SiteConfigInput>({
    resolver: zodResolver(siteConfigSchema),
    defaultValues: stripMeta(initialConfig),
    mode: "onChange",
  });

  const marqueeArray = useFieldArray({
    control: form.control,
    name: "marqueeItems",
  });
  const stickerArray = useFieldArray({
    control: form.control,
    name: "stickerEmojis",
  });

  const watchedValues = useWatch({ control: form.control });
  const debouncedDraft = useDebounce(watchedValues, 100);
  const hasBackground = Boolean(form.watch("backgroundPath"));

  const previewSrc = PREVIEW_TABS[activePreview];

  const postPreviewDraft = useMemo(
    () => () => {
      const draft = normalizeDraft(form.getValues());
      iframeRef.current?.contentWindow?.postMessage(
        { type: "theme-draft", payload: draft },
        window.location.origin
      );
    },
    [form]
  );

  useEffect(() => {
    postPreviewDraft();
  }, [debouncedDraft, postPreviewDraft]);

  const onSubmit = form.handleSubmit(async (values) => {
    setIsSaving(true);

    try {
      const saved = await updateSiteConfig(normalizeDraft(values));
      form.reset(stripMeta(saved));
      toast.success("테마 설정을 저장했습니다.");
    } catch (error) {
      console.error(error);
      toast.error("테마 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  });

  const uploadSingleAsset = async ({
    file,
    endpoint,
    onSuccess,
    setLoading,
  }: {
    file: File;
    endpoint: string;
    onSuccess: (data: { path: string; type?: "image" | "video" }) => void;
    setLoading: (next: boolean) => void;
  }) => {
    const formData = new FormData();
    formData.append("file", file);
    setLoading(true);

    try {
      const response = await fetch(endpoint, { method: "POST", body: formData });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "업로드에 실패했습니다.");
      }

      onSuccess(data);
      toast.success("파일을 업로드했습니다.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "업로드에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const deleteAsset = async ({
    endpoint,
    onSuccess,
    message,
  }: {
    endpoint: string;
    onSuccess: () => void;
    message: string;
  }) => {
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? message);
      }

      onSuccess();
      toast.success(message);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : message);
    }
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[minmax(420px,1fr)_auto] xl:items-start">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">테마 빌더</h1>
          <p className="text-sm text-muted-foreground">
            홈과 키오스크 화면의 색상, 문구, 배경, 토글을 관리자에서 바로 편집합니다.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>브랜드 색상</CardTitle>
            <CardDescription>전역 브랜드 토큰과 개별 요소 오버라이드를 관리합니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <ColorField
              label="Primary"
              value={form.watch("colorPrimary")}
              onChange={(value) => form.setValue("colorPrimary", value, { shouldDirty: true })}
            />
            <ColorField
              label="Accent"
              value={form.watch("colorAccent")}
              onChange={(value) => form.setValue("colorAccent", value, { shouldDirty: true })}
            />
            <ColorField
              label="본문"
              value={form.watch("colorTextMain")}
              onChange={(value) => form.setValue("colorTextMain", value, { shouldDirty: true })}
            />
            <ColorField
              label="보조 텍스트"
              value={form.watch("colorTextMuted")}
              onChange={(value) => form.setValue("colorTextMuted", value, { shouldDirty: true })}
            />
            <NullableColorField
              label="CTA 배경"
              value={form.watch("overrideCtaBg")}
              onChange={(value) => form.setValue("overrideCtaBg", value, { shouldDirty: true })}
            />
            <NullableColorField
              label="헤드라인 시작 색"
              value={form.watch("overrideHeadlineGradFrom")}
              onChange={(value) =>
                form.setValue("overrideHeadlineGradFrom", value, { shouldDirty: true })
              }
            />
            <NullableColorField
              label="헤드라인 끝 색"
              value={form.watch("overrideHeadlineGradTo")}
              onChange={(value) =>
                form.setValue("overrideHeadlineGradTo", value, { shouldDirty: true })
              }
            />
            <NullableColorField
              label="필터 활성 배경"
              value={form.watch("overrideFilterActiveBg")}
              onChange={(value) =>
                form.setValue("overrideFilterActiveBg", value, { shouldDirty: true })
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>텍스트</CardTitle>
            <CardDescription>홈/키오스크의 노출 문구를 편집합니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <TextField label="기관명" {...form.register("orgName")} />
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="홈 뱃지 1" {...form.register("homeBadge1")} />
              <TextField label="홈 뱃지 2" {...form.register("homeBadge2")} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="헤드라인 상단" {...form.register("homeHeadlineTop")} />
              <TextField label="헤드라인 하단" {...form.register("homeHeadlineBottom")} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="홈 서브카피" {...form.register("homeSubcopy")} />
              <TextField label="홈 CTA" {...form.register("homeCtaLabel")} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <TextField label="키오스크 제목" {...form.register("kioskTitle")} />
              <TextField label="빈 상태 제목" {...form.register("kioskEmptyTitle")} />
              <TextField label="빈 상태 보조문구" {...form.register("kioskEmptySubtitle")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>스티커 / 마퀴</CardTitle>
            <CardDescription>스티커 이모지 4개와 마퀴 항목을 조정합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              {stickerArray.fields.map((field, index) => (
                <TextField
                  key={field.id}
                  label={`스티커 ${index + 1}`}
                  {...form.register(`stickerEmojis.${index}.emoji`)}
                />
              ))}
            </div>

            <div className="space-y-3">
              {marqueeArray.fields.map((field, index) => (
                <div key={field.id} className="grid gap-3 md:grid-cols-[120px_1fr_auto]">
                  <Input placeholder="🎮" {...form.register(`marqueeItems.${index}.emoji`)} />
                  <Input
                    placeholder="닌텐도 스위치"
                    {...form.register(`marqueeItems.${index}.label`)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => marqueeArray.remove(index)}
                    disabled={marqueeArray.fields.length === 1}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    삭제
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => marqueeArray.append({ emoji: "✨", label: "새 항목" })}
              >
                <Plus className="mr-2 h-4 w-4" />
                마퀴 항목 추가
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>배경 / 로고</CardTitle>
            <CardDescription>배경 미디어와 홈 상단 로고를 업로드합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <AssetUploader
              label="배경 미디어"
              description="이미지 또는 MP4/WebM 동영상을 업로드합니다."
              currentPath={form.watch("backgroundPath")}
              currentType={form.watch("backgroundType")}
              isLoading={isUploadingBackground}
              accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm"
              onUpload={async (file) => {
                await uploadSingleAsset({
                  file,
                  endpoint: "/api/uploads/background",
                  setLoading: setIsUploadingBackground,
                  onSuccess: (data) => {
                    form.setValue("backgroundPath", data.path, { shouldDirty: true });
                    form.setValue("backgroundType", data.type ?? "image", { shouldDirty: true });
                  },
                });
              }}
              onDelete={() =>
                deleteAsset({
                  endpoint: "/api/uploads/background",
                  message: "배경을 삭제했습니다.",
                  onSuccess: () => {
                    form.setValue("backgroundPath", null, { shouldDirty: true });
                    form.setValue("backgroundType", null, { shouldDirty: true });
                  },
                })
              }
            />

            <Controller
              control={form.control}
              name="backgroundOverlayOpacity"
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>배경 오버레이</Label>
                    <span className="text-sm text-muted-foreground">{field.value}%</span>
                  </div>
                  <Input
                    type="range"
                    min={0}
                    max={80}
                    step={1}
                    value={field.value}
                    onChange={(event) => field.onChange(Number(event.target.value))}
                  />
                </div>
              )}
            />

            <AssetUploader
              label="로고"
              description="홈 상단에 노출할 로고 이미지입니다."
              currentPath={form.watch("logoPath")}
              isLoading={isUploadingLogo}
              accept=".jpg,.jpeg,.png,.webp,.gif"
              onUpload={async (file) => {
                await uploadSingleAsset({
                  file,
                  endpoint: "/api/uploads/logo",
                  setLoading: setIsUploadingLogo,
                  onSuccess: (data) => {
                    form.setValue("logoPath", data.path, { shouldDirty: true });
                  },
                });
              }}
              onDelete={() =>
                deleteAsset({
                  endpoint: "/api/uploads/logo",
                  message: "로고를 삭제했습니다.",
                  onSuccess: () => {
                    form.setValue("logoPath", null, { shouldDirty: true });
                  },
                })
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>표시 토글 / 레이아웃</CardTitle>
            <CardDescription>장식 요소, 필터, 그리드, 타이머를 조정합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <ToggleField
                label="라바램프"
                checked={form.watch("showLavaLamp")}
                disabled={hasBackground}
                description={hasBackground ? "배경 미디어가 있으면 자동으로 숨겨집니다." : undefined}
                onCheckedChange={(checked) =>
                  form.setValue("showLavaLamp", checked, { shouldDirty: true })
                }
              />
              <ToggleField
                label="스티커"
                checked={form.watch("showStickers")}
                onCheckedChange={(checked) =>
                  form.setValue("showStickers", checked, { shouldDirty: true })
                }
              />
              <ToggleField
                label="마퀴"
                checked={form.watch("showMarquee")}
                onCheckedChange={(checked) =>
                  form.setValue("showMarquee", checked, { shouldDirty: true })
                }
              />
              <ToggleField
                label="카테고리 필터"
                checked={form.watch("showFilters")}
                onCheckedChange={(checked) =>
                  form.setValue("showFilters", checked, { shouldDirty: true })
                }
              />
              <ToggleField
                label="키오스크 배경 그라데이션"
                checked={form.watch("showKioskBgGradient")}
                disabled={hasBackground}
                description={hasBackground ? "배경 미디어가 있으면 자동으로 숨겨집니다." : undefined}
                onCheckedChange={(checked) =>
                  form.setValue("showKioskBgGradient", checked, { shouldDirty: true })
                }
              />
            </div>

            <div className="space-y-3">
              <Label>키오스크 그리드 열 수</Label>
              <div className="flex gap-2">
                {[2, 3, 4, 5].map((cols) => (
                  <Button
                    key={cols}
                    type="button"
                    variant={form.watch("kioskGridCols") === cols ? "default" : "outline"}
                    onClick={() => form.setValue("kioskGridCols", cols, { shouldDirty: true })}
                  >
                    {cols}열
                  </Button>
                ))}
              </div>
            </div>

            <Controller
              control={form.control}
              name="inactivityTimeoutMs"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label>비활성 타이머</Label>
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="타이머 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30000">30초</SelectItem>
                      <SelectItem value="60000">1분</SelectItem>
                      <SelectItem value="120000">2분</SelectItem>
                      <SelectItem value="180000">3분</SelectItem>
                      <SelectItem value="300000">5분</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
          </CardContent>
        </Card>

        <div className="sticky bottom-0 flex items-center justify-end gap-3 rounded-lg border bg-background/95 p-4 backdrop-blur">
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset(defaultSiteConfigValues)}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            기본값으로 초기화
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            저장
          </Button>
        </div>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader className="flex flex-col gap-3">
            <div>
              <CardTitle>실시간 미리보기</CardTitle>
              <CardDescription>
                {preset.label} {isRotated ? "세로" : "가로"} ({frameWidth} × {frameHeight}) · {Math.round(zoom * 100)}%
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={device} onValueChange={(value) => setDevice(value as DevicePresetKey)}>
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DEVICE_PRESETS).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value.label} ({value.width} × {value.height})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsRotated((prev) => !prev)}
              >
                <RotateCw className="mr-1 h-4 w-4" />
                회전
              </Button>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.05).toFixed(2)))}
                >
                  −
                </Button>
                <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.05).toFixed(2)))}
                >
                  +
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom(1)}
                >
                  1:1
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Tabs value={activePreview} onValueChange={(value) => setActivePreview(value as keyof typeof PREVIEW_TABS)}>
              <TabsList>
                <TabsTrigger value="home">홈</TabsTrigger>
                <TabsTrigger value="kiosk">키오스크</TabsTrigger>
              </TabsList>
              <TabsContent value="home" />
              <TabsContent value="kiosk" />
            </Tabs>

            <div
              className="overflow-auto rounded-xl border bg-muted/30 p-3"
              style={{ maxHeight: "calc(100vh - 220px)" }}
            >
              <div
                style={{
                  width: frameWidth * zoom,
                  height: frameHeight * zoom,
                }}
              >
                <iframe
                  key={previewSrc}
                  ref={iframeRef}
                  src={previewSrc}
                  title="theme-preview"
                  onLoad={postPreviewDraft}
                  width={frameWidth}
                  height={frameHeight}
                  style={{
                    width: frameWidth,
                    height: frameHeight,
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                  }}
                  className="rounded-lg border bg-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function stripMeta(config: SiteConfig): SiteConfigInput {
  const { id, updatedAt, ...rest } = config;
  return rest;
}

function normalizeDraft(values: SiteConfigInput): SiteConfigInput {
  return {
    ...values,
    overrideCtaBg: values.overrideCtaBg || null,
    overrideHeadlineGradFrom: values.overrideHeadlineGradFrom || null,
    overrideHeadlineGradTo: values.overrideHeadlineGradTo || null,
    overrideFilterActiveBg: values.overrideFilterActiveBg || null,
    backgroundPath: values.backgroundPath || null,
    backgroundType: values.backgroundType || null,
    logoPath: values.logoPath || null,
  };
}

function TextField(props: ComponentProps<typeof Input> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input {...rest} />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type="color"
          className="h-10 w-16 p-1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </div>
  );
}

function NullableColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const fallback = value ?? "#000000";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          전역값 사용
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          type="color"
          className="h-10 w-16 p-1"
          value={fallback}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input value={value ?? ""} onChange={(event) => onChange(event.target.value || null)} />
      </div>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  disabled,
  description,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  description?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="space-y-1">
        <p className="font-medium">{label}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function AssetUploader({
  label,
  description,
  currentPath,
  currentType,
  accept,
  isLoading,
  onUpload,
  onDelete,
}: {
  label: string;
  description: string;
  currentPath: string | null;
  currentType?: string | null;
  accept: string;
  isLoading: boolean;
  onUpload: (file: File) => Promise<void>;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          파일 선택
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void onUpload(file);
                event.target.value = "";
              }
            }}
          />
        </Label>

        {currentPath ? (
          <Button type="button" variant="outline" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            삭제
          </Button>
        ) : null}
      </div>
      {currentPath ? (
        <p className="text-sm text-muted-foreground break-all">
          현재 파일: {currentPath}
          {currentType ? ` (${currentType})` : ""}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">현재 업로드된 파일이 없습니다.</p>
      )}
    </div>
  );
}
