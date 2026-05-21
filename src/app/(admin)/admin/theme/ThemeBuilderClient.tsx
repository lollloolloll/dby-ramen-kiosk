"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Loader2, RefreshCcw, RotateCw, Trash2, Upload } from "lucide-react";
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
import { broadcastSiteConfigChanged } from "@/lib/theme/broadcast";

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

/**
 * 검증된 색 조합 프리셋. 메인 톤 ↔ 배경 톤 명도 대비가 충분하도록 골라
 * 어떤 걸 눌러도 글자가 안 깨지게 했다. 색만 채우고 배경효과/문구는 안 건드림.
 */
const COLOR_PRESETS: Array<{
  name: string;
  swatch: string;
  values: Pick<
    SiteConfigInput,
    | "colorPrimary"
    | "colorAccent"
    | "colorTextMain"
    | "colorTextMuted"
    | "colorBackground"
  >;
}> = [
  {
    name: "파스텔",
    swatch: "#5FD4A5",
    values: {
      colorPrimary: "#5FD4A5",
      colorAccent: "#E896C0",
      colorTextMain: "#1E293B",
      colorTextMuted: "#64748B",
      colorBackground: "#F8FAFC",
    },
  },
  {
    name: "모던 다크",
    swatch: "#0F172A",
    values: {
      colorPrimary: "#6EE7B7",
      colorAccent: "#F0ABFC",
      colorTextMain: "#E5E7EB",
      colorTextMuted: "#94A3B8",
      colorBackground: "#0F172A",
    },
  },
  {
    name: "모노 미니멀",
    swatch: "#18181B",
    values: {
      colorPrimary: "#18181B",
      colorAccent: "#71717A",
      colorTextMain: "#18181B",
      colorTextMuted: "#71717A",
      colorBackground: "#FAFAFA",
    },
  },
  {
    name: "웜 선셋",
    swatch: "#FB923C",
    values: {
      colorPrimary: "#FB923C",
      colorAccent: "#F472B6",
      colorTextMain: "#292524",
      colorTextMuted: "#78716C",
      colorBackground: "#FFFBF5",
    },
  },
];

export function ThemeBuilderClient({ initialConfig }: { initialConfig: SiteConfig }) {
  const [activePreview, setActivePreview] = useState<keyof typeof PREVIEW_TABS>("home");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingDefaultItem, setIsUploadingDefaultItem] = useState(false);
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
      broadcastSiteConfigChanged();
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
      broadcastSiteConfigChanged();
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
      broadcastSiteConfigChanged();
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
            기관 정보, 색상, 이미지를 수정하면 홈과 키오스크 화면에 바로 반영됩니다.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>우리 기관</CardTitle>
            <CardDescription>홈 화면에 표시될 기관 이름과 인사말 문구입니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <TextField
              label="기관 이름"
              helper="예: 쌍청문 · D.Base"
              {...form.register("orgName")}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="홈 큰 글씨 (윗줄)"
                helper="예: 필요한 물품"
                {...form.register("homeHeadlineTop")}
              />
              <TextField
                label="홈 큰 글씨 (아랫줄)"
                helper="예: 간편하게 대여"
                {...form.register("homeHeadlineBottom")}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="홈 참여 버튼 글자"
                helper="예: 시작하기"
                {...form.register("homeCtaLabel")}
              />
              <TextField
                label="키오스크 페이지 제목"
                helper="대여 목록 화면 상단에 표시됩니다"
                {...form.register("kioskTitle")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>색상</CardTitle>
            <CardDescription>키오스크 전체에 적용되는 4가지 기본 색입니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>색 조합 프리셋</Label>
              <p className="text-xs text-muted-foreground">
                검증된 색 조합을 한 번에 적용합니다. 적용 후 개별 색을 더 조정할 수 있습니다.
              </p>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((presetItem) => (
                  <Button
                    key={presetItem.name}
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      (
                        Object.entries(presetItem.values) as Array<
                          [keyof typeof presetItem.values, string]
                        >
                      ).forEach(([key, value]) =>
                        form.setValue(key, value, { shouldDirty: true })
                      );
                      toast.success(`'${presetItem.name}' 색 조합을 적용했습니다.`);
                    }}
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border"
                      style={{ backgroundColor: presetItem.swatch }}
                    />
                    {presetItem.name}
                  </Button>
                ))}
              </div>
            </div>
            <ColorField
              label="메인 색상"
              helper="타이틀·버튼·강조에 사용"
              value={form.watch("colorPrimary")}
              onChange={(value) => form.setValue("colorPrimary", value, { shouldDirty: true })}
            />
            <ColorField
              label="포인트 색상"
              helper="보조 강조·뱃지에 사용"
              value={form.watch("colorAccent")}
              onChange={(value) => form.setValue("colorAccent", value, { shouldDirty: true })}
            />
            <ColorField
              label="메인 톤 (어두운 색 권장)"
              helper="이 색 하나가 본문 글자색 + 상단바·홈 hero의 배경을 함께 담당합니다."
              value={form.watch("colorTextMain")}
              onChange={(value) => form.setValue("colorTextMain", value, { shouldDirty: true })}
            />
            <ColorField
              label="배경 톤 (밝은 색 권장)"
              helper="이 색 하나가 카탈로그 바탕 + 상단바·홈 hero 위 글자색을 함께 담당합니다."
              value={form.watch("colorBackground")}
              onChange={(value) => form.setValue("colorBackground", value, { shouldDirty: true })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>이미지와 레이아웃</CardTitle>
            <CardDescription>로고, 배경, 아이템 기본 이미지를 업로드합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <AssetUploader
              label="기관 로고"
              description="홈 상단에 표시됩니다. 비워두면 표시되지 않습니다."
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

            <AssetUploader
              label="배경 이미지/영상"
              description="키오스크 전체 배경. 이미지(JPG·PNG·WebP) 또는 영상(MP4·WebM) 업로드 가능."
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

            <AssetUploader
              label="아이템 기본 이미지"
              description="아이템에 이미지가 없을 때 대신 보여줄 이미지입니다."
              currentPath={form.watch("defaultItemImagePath")}
              isLoading={isUploadingDefaultItem}
              accept=".jpg,.jpeg,.png,.webp,.gif"
              onUpload={async (file) => {
                await uploadSingleAsset({
                  file,
                  endpoint: "/api/uploads/default-item",
                  setLoading: setIsUploadingDefaultItem,
                  onSuccess: (data) => {
                    form.setValue("defaultItemImagePath", data.path, {
                      shouldDirty: true,
                    });
                  },
                });
              }}
              onDelete={() =>
                deleteAsset({
                  endpoint: "/api/uploads/default-item",
                  message: "기본 이미지를 삭제했습니다.",
                  onSuccess: () => {
                    form.setValue("defaultItemImagePath", null, {
                      shouldDirty: true,
                    });
                  },
                })
              }
            />

            <div className="space-y-2">
              <Label>키오스크 그리드 (한 줄에 몇 개)</Label>
              <p className="text-xs text-muted-foreground">
                아이템 카드를 한 줄에 몇 개씩 보여줄지 선택합니다.
              </p>
              <div className="flex gap-2">
                {[2, 3, 4, 5].map((cols) => (
                  <Button
                    key={cols}
                    type="button"
                    variant={form.watch("kioskGridCols") === cols ? "default" : "outline"}
                    onClick={() => form.setValue("kioskGridCols", cols, { shouldDirty: true })}
                  >
                    {cols}개
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>배경 효과</Label>
              <p className="text-xs text-muted-foreground">
                홈/카탈로그 화면 뒤에서 움직이는 시각 효과입니다. "끄기"로 두면 단색 배경만 보입니다.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "aurora", label: "오로라" },
                  { value: "wave", label: "파티클 웨이브" },
                  { value: "lava", label: "그라데이션 (라바램프)" },
                  { value: "none", label: "끄기" },
                ].map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={
                      form.watch("visualPreset") === option.value
                        ? "default"
                        : "outline"
                    }
                    onClick={() =>
                      form.setValue(
                        "visualPreset",
                        option.value as "aurora" | "wave" | "lava" | "none",
                        { shouldDirty: true }
                      )
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between p-5 font-semibold">
            <div className="flex flex-col gap-1">
              <span>고급 설정</span>
              <span className="text-xs font-normal text-muted-foreground">
                작은 뱃지, 보조문구, 빈 상태 메시지, 색상 미세조정 등 자주 만질 일이 없는 항목
              </span>
            </div>
            <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-6 border-t p-6">
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">보조 문구</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="홈 작은 뱃지 1"
                  helper="비우면 안 보임. 예: 4층 라운지"
                  {...form.register("homeBadge1")}
                />
                <TextField
                  label="홈 작은 뱃지 2"
                  helper="비우면 안 보임"
                  {...form.register("homeBadge2")}
                />
              </div>
              <TextField
                label="홈 큰 글씨 옆 보조문구"
                helper="기관 이름 뒤에 붙는 한 줄. 비우면 안 보임. 예: 에서 빌려보세요"
                {...form.register("homeSubcopy")}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="빈 상태 제목"
                  helper="키오스크에 아이템이 없을 때 큰 글씨"
                  {...form.register("kioskEmptyTitle")}
                />
                <TextField
                  label="빈 상태 보조문구"
                  helper="빈 상태 아래에 보일 안내문"
                  {...form.register("kioskEmptySubtitle")}
                />
              </div>
            </section>

            <section className="space-y-4 border-t pt-6">
              <h3 className="text-sm font-semibold text-muted-foreground">색상 미세조정</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <ColorField
                  label="흐린 글자 색"
                  helper="보조 텍스트·설명문에 사용"
                  value={form.watch("colorTextMuted")}
                  onChange={(value) => form.setValue("colorTextMuted", value, { shouldDirty: true })}
                />
                <NullableColorField
                  label="참여 버튼 배경"
                  value={form.watch("overrideCtaBg")}
                  onChange={(value) => form.setValue("overrideCtaBg", value, { shouldDirty: true })}
                />
                <NullableColorField
                  label="홈 큰 글씨 그라데이션 시작색"
                  value={form.watch("overrideHeadlineGradFrom")}
                  onChange={(value) =>
                    form.setValue("overrideHeadlineGradFrom", value, { shouldDirty: true })
                  }
                />
                <NullableColorField
                  label="홈 큰 글씨 그라데이션 끝색"
                  value={form.watch("overrideHeadlineGradTo")}
                  onChange={(value) =>
                    form.setValue("overrideHeadlineGradTo", value, { shouldDirty: true })
                  }
                />
                <NullableColorField
                  label="활성 카테고리 배경"
                  value={form.watch("overrideFilterActiveBg")}
                  onChange={(value) =>
                    form.setValue("overrideFilterActiveBg", value, { shouldDirty: true })
                  }
                />
              </div>
            </section>

            <section className="space-y-4 border-t pt-6">
              <h3 className="text-sm font-semibold text-muted-foreground">표시 옵션</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <ToggleField
                  label="카테고리 필터 보이기"
                  checked={form.watch("showFilters")}
                  onCheckedChange={(checked) =>
                    form.setValue("showFilters", checked, { shouldDirty: true })
                  }
                />
                <ToggleField
                  label="키오스크 배경 그라데이션"
                  checked={form.watch("showKioskBgGradient")}
                  disabled={hasBackground}
                  description={hasBackground ? "배경 이미지/영상이 있으면 자동으로 숨겨집니다." : undefined}
                  onCheckedChange={(checked) =>
                    form.setValue("showKioskBgGradient", checked, { shouldDirty: true })
                  }
                />
              </div>

              <Controller
                control={form.control}
                name="backgroundOverlayOpacity"
                render={({ field }) => (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>배경 어둡기 (배경 이미지/영상 위에 검은 막)</Label>
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
            </section>
          </div>
        </details>

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
    defaultItemImagePath: values.defaultItemImagePath || null,
  };
}

function TextField(
  props: ComponentProps<typeof Input> & { label: string; helper?: string }
) {
  const { label, helper, ...rest } = props;
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input {...rest} />
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

function ColorField({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper?: string;
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
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
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
  const isUsingDefault = value === null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {!isUsingDefault && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            기본값으로
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          type="color"
          className="h-10 w-16 p-1"
          value={fallback}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          placeholder={isUsingDefault ? "기본값 사용 중 — 색을 지정하지 않음" : ""}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
        />
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
