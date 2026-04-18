# Theme Builder (White-Label Customization)

> **목적**: 단일 기관 전용이었던 이 키오스크 웹앱을 B2B white-label 형태로 확장. 관리자가 소스 수정 없이 관리자 페이지에서 브랜드 색상·텍스트·배경·레이아웃 토글을 편집하면 `/`(홈)와 `/kiosk`에 즉시 반영된다.
>
> **범위 단일 테넌트**: 이 배포 1개 = 이 기관 1개. SQLite 싱글톤 row 1개로 관리.
> **멀티 테넌시·서브도메인·테마 템플릿 A/B/C는 본 스코프 밖.**

---

## 0. TL;DR

| 항목 | 결정 |
|---|---|
| 테넌트 구조 | 단일 테넌트, SQLite `site_config` 싱글톤 row 1개 (id=1) |
| 편집 페이지 | `/` (홈), `/kiosk` 2개 |
| 편집 차원 | 색상(전역 2색 + 요소 오버라이드 4~5개) / 텍스트 / 배경 이미지 / 토글 / 그리드 열 수 / 비활성 타이머 |
| 기술 축 | CSS 변수 + Tailwind v4 `@theme` + React Context + iframe postMessage |
| 관리자 UX | Split-screen 실시간 미리보기 (iframe 내 실제 페이지 렌더) |
| 저장 흐름 | 즉시 반영 (Draft/Publish 2단계 X, 단일 테넌트라 리스크 낮음) |
| 예상 공수 | **~7 man-day** |

---

## 1. Goals / Non-Goals

### Goals
- G1. 소스 재빌드 없이 관리자가 브랜드 컬러·로고·헤드라인·배경을 바꿀 수 있다.
- G2. 이미지(정지/동영상) 배경 업로드 가능. 투명도 오버레이로 가독성 확보.
- G3. 기존 비주얼 요소(라바램프·스티커·마퀴·필터)는 토글 on/off만 허용.
- G4. 관리자 편집 화면에서 **실제 페이지가 실시간으로 바뀌는 모습**을 본다.
- G5. 배경 이미지 있을 때는 충돌하는 배경 레이어를 **자동 OFF**, 콘텐츠 레이어는 **독립 토글** 유지.

### Non-Goals (명시적 제외)
- 드래그앤드롭 레이아웃 에디터
- 픽셀 단위 여백/radius/애니메이션 편집
- 자유 CSS·JavaScript 주입
- 폰트 파일 업로드 (큐레이션 allowlist만 — 본 스코프에선 폰트 스위치 자체도 뺌)
- 페이지 추가/삭제
- 멀티 테넌시·서브도메인 라우팅
- 컴포넌트 내부 구조 변경 (카드 내 요소 순서 등)
- 템플릿 A/B/C 프리셋

---

## 2. SQLite 스키마

Drizzle 싱글톤 패턴 (id=1 row 1개만 존재). `drizzle/schema.ts`에 추가.

```ts
export const siteConfig = sqliteTable("site_config", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(), // 항상 1

  // ──────────────── 전역 토큰 ────────────────
  // OKLCH 또는 hex. UI는 hex 입력, DB 저장도 hex.
  colorPrimary:   text("color_primary").default("#5FD4A5").notNull(),   // 기존 민트
  colorAccent:    text("color_accent").default("#E896C0").notNull(),    // 기존 핑크
  colorTextMain:  text("color_text_main").default("#1e293b").notNull(), // slate-800
  colorTextMuted: text("color_text_muted").default("#64748b").notNull(),// slate-500

  // ──────────────── 요소별 색상 오버라이드 ────────────────
  // null 이면 전역 토큰 사용, 값 있으면 오버라이드.
  overrideCtaBg:          text("override_cta_bg"),
  overrideHeadlineGradFrom:text("override_headline_grad_from"),
  overrideHeadlineGradTo: text("override_headline_grad_to"),
  overrideFilterActiveBg: text("override_filter_active_bg"),

  // ──────────────── 텍스트 ────────────────
  orgName:            text("org_name").default("쌍청문").notNull(),
  homeBadge1:         text("home_badge_1").default("우리들의 아지트").notNull(),
  homeBadge2:         text("home_badge_2").default("나의 미성숙함이 머물다 가는 곳").notNull(),
  homeHeadlineTop:    text("home_headline_top").default("학교 끝나고").notNull(),
  homeHeadlineBottom: text("home_headline_bottom").default("뭐하고 놀래?").notNull(),
  homeSubcopy:        text("home_subcopy").default("으로 다 모여! 🎉").notNull(), // 기관명 뒤에 붙는 문구
  homeCtaLabel:       text("home_cta_label").default("😎 놀 준비 완료!").notNull(),
  kioskTitle:         text("kiosk_title").default("쉬다 대여 목록").notNull(),
  kioskEmptyTitle:    text("kiosk_empty_title").default("현재 대여가능한 상품이 없습니다.").notNull(),
  kioskEmptySubtitle: text("kiosk_empty_subtitle").default("관리자에게 문의해주세요.").notNull(),

  // ──────────────── 마퀴 아이템 ────────────────
  // JSON: [{emoji:"🎮", label:"닌텐도 스위치"}, ...]
  marqueeItemsJson: text("marquee_items_json")
    .default('[{"emoji":"🎮","label":"닌텐도 스위치"},{"emoji":"🍜","label":"라면"},{"emoji":"🎲","label":"보드게임"},{"emoji":"🏸","label":"배드민턴"},{"emoji":"🍿","label":"맛있는 간식"},{"emoji":"🏀","label":"농구"},{"emoji":"🏓","label":"탁구"}]')
    .notNull(),

  // ──────────────── 스티커 아이템 ────────────────
  // JSON: [{emoji:"🎮"}, {emoji:"🎤"}, {emoji:"🎲"}, {emoji:"🍜"}] (최대 4개, 위치는 고정)
  stickerEmojisJson: text("sticker_emojis_json")
    .default('[{"emoji":"🎮"},{"emoji":"🎤"},{"emoji":"🎲"},{"emoji":"🍜"}]')
    .notNull(),

  // ──────────────── 토글 ────────────────
  showLavaLamp:    integer("show_lava_lamp",    { mode: "boolean" }).default(true).notNull(), // 이미지 업로드 시 런타임에서 강제 false
  showStickers:    integer("show_stickers",     { mode: "boolean" }).default(true).notNull(),
  showMarquee:     integer("show_marquee",      { mode: "boolean" }).default(true).notNull(),
  showFilters:     integer("show_filters",      { mode: "boolean" }).default(true).notNull(), // 키오스크 카테고리 필터
  showKioskBgGradient: integer("show_kiosk_bg_gradient", { mode: "boolean" }).default(true).notNull(),
  // 이미지 업로드 시 런타임에서 강제 false

  // ──────────────── 배경 미디어 ────────────────
  backgroundPath:      text("background_path"),                              // /uploads/background/<file>.ext, null이면 미사용
  backgroundType:      text("background_type", { enum: ["image", "video"] }),// null 가능
  backgroundOverlayOpacity: integer("background_overlay_opacity").default(30).notNull(), // 0~80 (%)
  logoPath:            text("logo_path"),                                    // 선택 로고 (홈 상단)

  // ──────────────── 레이아웃 옵션 ────────────────
  kioskGridCols:     integer("kiosk_grid_cols").default(4).notNull(),  // 2/3/4/5
  inactivityTimeoutMs: integer("inactivity_timeout_ms").default(60000).notNull(), // 30000~300000

  // ──────────────── 메타 ────────────────
  updatedAt: integer("updated_at")
    .default(sql`(CURRENT_TIMESTAMP)`)
    .notNull(),
});
```

### 싱글톤 보증
- Migration seed: `INSERT INTO site_config (id) VALUES (1)` 1회.
- `getSiteConfig()` 액션: 항상 `id=1` row 반환, 없으면 default insert 후 재조회.

---

## 3. 편집 대상 — 하드코딩 전수 조사

### 3.1 `src/app/page.tsx`

| 라인 | 현재 | 매핑 |
|---|---|---|
| 37 | `INACTIVITY_TIMEOUT = 60_000` | `siteConfig.inactivityTimeoutMs` |
| 224 | `selection:bg-[oklch(0.75_0.12_165/0.2)]` | `--brand-primary` (alpha 조정) |
| 228, 232, 236 | lava lamp 3개 블러 원 | 조건 `showLavaLamp && !backgroundPath` |
| 232, 308, 340 | `oklch(0.7_0.18_350)` (accent) | `--brand-accent` |
| 245 | "관리자" 링크 hover 색 | `--brand-primary` |
| 250 | "전체화면" hover 색 | `--brand-primary` |
| 266~283 | 스티커 4개 (🎮🎤🎲🍜) | `stickerEmojisJson`, 조건 `showStickers` |
| 293 | "우리들의 아지트" | `homeBadge1` |
| 301 | "나의 미성숙함이 머물다 가는 곳" | `homeBadge2` |
| 306 | "학교 끝나고" | `homeHeadlineTop` |
| 308~310 | "뭐하고 놀래?" (grad text) | `homeHeadlineBottom`, 그라데이션 토큰 |
| 315 | "쌍청문" | `orgName` |
| 317 | "으로 다 모여! 🎉" | `homeSubcopy` |
| 324~353 | CTA 버튼 | `homeCtaLabel`, `overrideCtaBg?` |
| 361~366 | Marquee | `marqueeItemsJson`, 조건 `showMarquee` |
| 425~438 | `MarqueeText` 하드코딩 스팬들 | `marqueeItemsJson`에서 동적 map |
| 292, 300 | 뱃지 아이콘 색 `oklch(0.75_0.12_165)` | `--brand-primary` |

### 3.2 `src/app/(kiosk)/kiosk/KioskPageClient.tsx`

| 라인 | 현재 | 매핑 |
|---|---|---|
| 32 | `INACTIVITY_TIMEOUT = 60_000` | `siteConfig.inactivityTimeoutMs` |
| 182 | 배경 `bg-linear-to-br from-...` | 조건 `showKioskBgGradient && !backgroundPath`, `--brand-primary/accent` |
| 188, 190, 191 | "홈으로" 버튼 색상 | `--brand-primary` |
| 198 | "쉬다 대여 목록" | `kioskTitle` |
| 198 | 타이틀 색상 | `--brand-primary` |
| 201 | 언더라인 gradient | `--brand-primary`, `--brand-accent` |
| 205~219 | 카테고리 필터 버튼 | `overrideFilterActiveBg?`, `--brand-primary`, 조건 `showFilters` |
| 227 | `grid-cols-4` | `kioskGridCols` 동적 |
| 237~241 | "현재 대여가능한..." | `kioskEmptyTitle` (selectedCategory 의존 분기는 유지하되 기본 문구만 편집) |
| 244~247 | "관리자에게 문의해주세요." | `kioskEmptySubtitle` |
| 235, 237 | 빈 상태 카드 테두리 색 | `--brand-primary` |

> **빈 상태 메시지 편집 가능화**: 스펙에 포함 (확정). 카테고리별 분기 문구 ("XX 카테고리에...")는 코드에서 조합하되, 기본 문구만 편집 대상.
>
> **동영상 배경 허용**: 스펙에 포함 (확정). `<video autoPlay muted loop playsInline>`로 렌더.

### 3.3 공통 / 기타

- `src/app/layout.tsx` (서버 컴포넌트): `<html>`에 CSS 변수 주입, 로고 메타, 파비콘 등 — 본 스코프 편집 대상에 layout.tsx 수정 1회 필요.
- 기존 `/uploads/promotion` 업로드 로직은 그대로 유지. 신규 `/uploads/background` 라우트 1개만 추가.

---

## 4. CSS 변수 & Tailwind v4 토큰

### 4.1 `src/app/layout.tsx` 서버 컴포넌트에서 주입

```tsx
const config = await getSiteConfig();
return (
  <html
    style={{
      "--brand-primary": config.colorPrimary,
      "--brand-accent":  config.colorAccent,
      "--brand-text":    config.colorTextMain,
      "--brand-muted":   config.colorTextMuted,
      "--brand-cta-bg":       config.overrideCtaBg          ?? config.colorPrimary,
      "--brand-headline-from":config.overrideHeadlineGradFrom?? config.colorPrimary,
      "--brand-headline-to":  config.overrideHeadlineGradTo  ?? config.colorAccent,
      "--brand-filter-active":config.overrideFilterActiveBg  ?? config.colorPrimary,
      "--bg-overlay-opacity": `${config.backgroundOverlayOpacity / 100}`,
    } as React.CSSProperties}
  >
```

### 4.2 `src/app/globals.css` — Tailwind v4 `@theme`

```css
@theme {
  --color-brand-primary: var(--brand-primary);
  --color-brand-accent:  var(--brand-accent);
  --color-brand-text:    var(--brand-text);
  --color-brand-muted:   var(--brand-muted);
  --color-brand-cta:     var(--brand-cta-bg);
  --color-brand-filter:  var(--brand-filter-active);
}
```

→ 이후 모든 페이지에서 `bg-brand-primary`, `text-brand-accent`, `border-brand-primary/30` 등 사용.

하드코딩된 `oklch(0.75_0.12_165)` → `bg-brand-primary`, `text-brand-primary`로 치환 (sed 가능하지만 alpha 값별로 (`/0.2`, `/0.3`, `/0.1` 등) 치환이 다르므로 수동 확인).

---

## 5. ThemeProvider (실시간 미리보기 기반)

### 5.1 구조

```
 <html style={{...css vars from DB}}>
   <body>
     <ThemeProvider initial={configFromDB}>   ← client context
       {children}
     </ThemeProvider>
   </body>
 </html>
```

### 5.2 `src/components/theme/ThemeProvider.tsx` (신규)

```tsx
"use client";
const ThemeContext = createContext<SiteConfig>(null!);
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ initial, children }: { initial: SiteConfig; children: React.ReactNode }) {
  const [config, setConfig] = useState(initial);
  const isPreview = useSearchParams().get("preview") === "1";

  useEffect(() => {
    if (!isPreview) return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "theme-draft") return;
      setConfig(e.data.payload);
      // CSS 변수도 즉시 반영 (html style 덮어쓰기)
      Object.entries(toCssVars(e.data.payload)).forEach(([k, v]) => {
        document.documentElement.style.setProperty(k, v);
      });
    };
    window.addEventListener("message", onMsg);
    parent.postMessage({ type: "preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, [isPreview]);

  return <ThemeContext.Provider value={config}>{children}</ThemeContext.Provider>;
}
```

### 5.3 `page.tsx` / `KioskPageClient.tsx` 수정 방향

- `useTheme()` 으로 config 읽고 조건부 렌더.
- 배경 이미지 있으면 `showLavaLamp`, `showKioskBgGradient` 런타임 강제 false.
- Preview mode 감지 시:
  - 비활성 타이머 setTimeout 호출 X
  - `router.refresh()` 스킵
  - `processAndMutateExpiredRentals()` 스킵
  - `sessionStorage.setItem/getItem` 스킵
  - PromotionSlider 자동 표시 X

---

## 6. 관리자 편집 페이지

### 6.1 경로 & 구조

- 신규: `src/app/(admin)/admin/theme/page.tsx`
- 레이아웃: 좌 40% 편집 폼 / 우 60% iframe 미리보기 (탭: 홈 / 키오스크)

### 6.2 Zod 스키마 (`src/lib/schemas/siteConfig.ts`)

```ts
export const siteConfigSchema = z.object({
  // 색상 — hex 7자리
  colorPrimary:   z.string().regex(/^#[0-9a-fA-F]{6}$/),
  colorAccent:    z.string().regex(/^#[0-9a-fA-F]{6}$/),
  colorTextMain:  z.string().regex(/^#[0-9a-fA-F]{6}$/),
  colorTextMuted: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  overrideCtaBg:          z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  overrideHeadlineGradFrom:z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  overrideHeadlineGradTo: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  overrideFilterActiveBg: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),

  orgName:            z.string().min(1).max(20),
  homeBadge1:         z.string().max(30),
  homeBadge2:         z.string().max(40),
  homeHeadlineTop:    z.string().min(1).max(30),
  homeHeadlineBottom: z.string().min(1).max(30),
  homeSubcopy:        z.string().max(40),
  homeCtaLabel:       z.string().min(1).max(20),
  kioskTitle:         z.string().min(1).max(30),
  kioskEmptyTitle:    z.string().max(50),
  kioskEmptySubtitle: z.string().max(50),

  marqueeItems:  z.array(z.object({ emoji: z.string().max(4), label: z.string().max(20) })).max(20),
  stickerEmojis: z.array(z.object({ emoji: z.string().max(4) })).length(4),

  showLavaLamp:    z.boolean(),
  showStickers:    z.boolean(),
  showMarquee:     z.boolean(),
  showFilters:     z.boolean(),
  showKioskBgGradient: z.boolean(),

  backgroundType: z.enum(["image", "video"]).nullable(),
  backgroundPath: z.string().nullable(),
  backgroundOverlayOpacity: z.number().int().min(0).max(80),
  logoPath: z.string().nullable(),

  kioskGridCols: z.number().int().min(2).max(5),
  inactivityTimeoutMs: z.number().int().min(30_000).max(300_000),
});
```

### 6.3 폼 UI 구조 (react-hook-form + shadcn)

```
편집 폼 (세로 스크롤, 섹션별 접이식 <Accordion>)
├─ 브랜드 색상
│   ├─ Primary / Accent [ColorPicker × 2]
│   ├─ 텍스트 / 보조텍스트 색상 [ColorPicker × 2]
│   └─ 요소별 색상 (접이식, 각 스위치: 전역 토큰 / 직접 지정)
│       ├─ CTA 배경 · 헤드라인 grad from/to · 필터 active 배경
├─ 텍스트
│   ├─ 기관명 · 홈 뱃지 2개 · 헤드라인 상/하 · 서브카피
│   ├─ CTA · 키오스크 타이틀 · 빈 상태 2줄
│   ├─ 스티커 이모지 × 4 (emoji-mart)
│   └─ 마퀴 항목 배열 (동적 추가/삭제, {emoji, label})
├─ 배경
│   ├─ 이미지/동영상 업로드 [FileInput]
│   ├─ 오버레이 투명도 [Slider 0-80]
│   └─ 현재 파일 표시 + [삭제] 버튼
├─ 표시 토글
│   ├─ 라바램프 / 스티커 / 마퀴 / 필터 / 키오스크 배경 [Switch × 5]
│   └─ (배경 이미지 있을 때 라바램프·키오스크 배경 토글은 disabled + 안내)
├─ 레이아웃
│   ├─ 키오스크 그리드 열 수 [RadioGroup 2/3/4/5]
│   └─ 비활성 타이머 [Select 30s/1m/2m/3m/5m]
├─ 로고
│   └─ 이미지 업로드 (선택)
└─ [초기화] [저장]  ← 하단 sticky
```

### 6.4 폼 → 미리보기 전파

```tsx
const draft = watch(); // react-hook-form
useEffect(() => {
  iframeRef.current?.contentWindow?.postMessage(
    { type: "theme-draft", payload: draft },
    window.location.origin
  );
}, [draft]);
```

디바운스 100ms 권장 (색상 피커 드래그 중 과도 전송 방지).

### 6.5 Server Action (`src/lib/actions/siteConfig.ts`)

```ts
"use server";
export async function getSiteConfig(): Promise<SiteConfig> { ... }
export async function updateSiteConfig(input: SiteConfigInput) {
  const parsed = siteConfigSchema.parse(input);
  await db.update(siteConfig).set({
    ...parsed,
    marqueeItemsJson: JSON.stringify(parsed.marqueeItems),
    stickerEmojisJson: JSON.stringify(parsed.stickerEmojis),
    updatedAt: sql`CURRENT_TIMESTAMP`,
  }).where(eq(siteConfig.id, 1));
  revalidateTag("site-config");
}
```

`getSiteConfig`은 `unstable_cache(fn, ['site-config'], { tags: ['site-config'] })`로 감싸 ISR 적용.

---

## 7. 배경 업로드

### 7.1 신규 API 라우트

`src/app/api/uploads/background/route.ts` — 기존 promotion 라우트를 얇게 복제:

- POST: 파일 1개 업로드. 기존 파일 있으면 먼저 삭제 (히스토리 X, 현재 배경 1개만 유지).
- DELETE: 현재 배경 파일 삭제 + DB `backgroundPath = null`.
- 허용: 이미지(jpg/png/webp) + 동영상(mp4/webm).
- 업로드 직후 `POST /api/uploads/background`가 파일 저장 → server action `updateSiteConfigBackground(path, type)`로 DB 반영.

### 7.2 저장 위치
- `public/uploads/background/<hash>.<ext>` (한 번에 1개만 유지)
- Docker volume 필요: `./public/uploads → /app/public/uploads`로 이미 바인드되어 있어야 함 (기존 promotion과 동일). 없으면 업로드본이 컨테이너 재시작 시 날아감 → **Dockerfile/docker-compose 확인 체크리스트에 포함**.

### 7.3 배경 이미지 렌더 구조

```tsx
// page.tsx / kiosk page 최상단
{config.backgroundPath && (
  <div className="fixed inset-0 z-0 pointer-events-none">
    {config.backgroundType === "video" ? (
      <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover">
        <source src={config.backgroundPath} />
      </video>
    ) : (
      <img src={config.backgroundPath} className="absolute inset-0 w-full h-full object-cover" />
    )}
    <div className="absolute inset-0 bg-black"
         style={{ opacity: `var(--bg-overlay-opacity)` }} />
  </div>
)}
```

### 7.4 충돌 자동 해결 규칙

```ts
const effectiveShowLavaLamp      = config.showLavaLamp      && !config.backgroundPath;
const effectiveShowKioskGradient = config.showKioskBgGradient && !config.backgroundPath;
// 스티커·마퀴·필터는 영향 없음 (관리자 토글 그대로 존중)
```

폼 UI에서도 배경 파일이 존재할 때 두 토글은 `disabled + tooltip: "배경 이미지가 있을 때는 자동으로 숨겨집니다"`.

---

## 8. Preview mode 동작

`?preview=1` 쿼리 활성 시:

| 동작 | Preview 모드 |
|---|---|
| 비활성 타이머 (`setTimeout(show, INACTIVITY_TIMEOUT)`) | 스킵 |
| 홈 `sessionStorage('showPromotionOnHome')` 체크 | 스킵 |
| 홈 최초 홍보물 자동 팝업 (`hasSeenInitialPromotion`) | 스킵 |
| 키오스크 `resetInactivityTimer` | 스킵 |
| 키오스크 → 홈 redirect (`router.push("/")`) | 스킵 |
| `router.refresh()` | 스킵 |
| `processAndMutateExpiredRentals()` | 스킵 |
| `sessionStorage` 접근 | 스킵 |
| PromotionSlider 오버레이 | 항상 숨김 |
| CTA 버튼 클릭 네비게이션 | `e.preventDefault()` — iframe 안에서 키오스크로 이동 금지 (탭 전환은 parent가) |

구현: `const isPreview = useSearchParams().get("preview") === "1"` 훅 하나 공통화 → `src/lib/hooks/usePreviewMode.ts`.

미리보기 탭 전환은 parent가 iframe `src`를 `/?preview=1` ↔ `/kiosk?preview=1`로 스왑.

---

## 9. 마일스톤

| # | 단위 | 작업 | 공수 | 검증 |
|---|---|---|---|---|
| **M1** | 0.5일 | Drizzle 스키마 + migration + seed(id=1) + `getSiteConfig`/`updateSiteConfig` action | `drizzle-kit push` 성공, id=1 row 존재 |
| **M2** | 1일 | CSS 변수 주입 (`layout.tsx`) + Tailwind `@theme` 토큰 선언 + 하드코딩 OKLCH 30여 곳 → `brand-*` 치환 | 기존 페이지 픽셀 동등 렌더 |
| **M3** | 0.5일 | `ThemeProvider` + `useTheme` + `usePreviewMode` 훅 | 컨텍스트로 config 읽기 성공 |
| **M4** | 1일 | 홈 페이지 바인딩 (text·toggle·sticker·marquee·grid·timer 동적화) | 수동 DB 수정으로 변경 확인 |
| **M5** | 1일 | 키오스크 페이지 바인딩 (title·empty msg·filter toggle·grid cols·colors) | 수동 DB 수정으로 변경 확인 |
| **M6** | 0.5일 | 배경 업로드 라우트 + 렌더 레이어 + 자동 OFF 규칙 + 동영상 허용 | 이미지/동영상 업로드·표시 확인 |
| **M7** | 1.5일 | 관리자 폼 UI (`/admin/theme`) — react-hook-form + 섹션별 Accordion + 색상 피커 + 업로드 | 폼 저장 시 실제 반영 |
| **M8** | 1일 | iframe 미리보기 + postMessage + preview mode 타이머/redirect 제거 | 색상·텍스트 즉시 반영 |
| **M9** | 0.5일 | QA — WCAG AA 대비 체크, 폴백 동작, 권한 가드(`/admin/theme`는 ADMIN only), Docker volume 확인 | 수동 QA 체크리스트 |
| **합계** | **~7일** | | | |

---

## 10. 위험 & 미해결

### 10.1 Tailwind v4 + 동적 색상 한계
Tailwind v4 JIT가 `bg-[var(--brand-primary)/30]` 같은 임의 alpha 조합을 항상 지원하진 않음. `color-mix()` CSS 함수를 쓰거나, alpha 스케일(`/10`, `/20`, `/30`, `/60`)별로 별도 CSS 변수를 layout.tsx에서 미리 계산해 주입하는 것이 안전.
→ **M2에서 alpha 조합 matrix 실측 필요**. 실패 시 fallback: `--brand-primary-alpha-20: color-mix(in oklch, var(--brand-primary) 20%, transparent);` 형태.

### 10.2 Docker volume 누락 시 업로드 휘발
현재 `docker-compose.yml`이 `public/uploads`를 볼륨 바인드하는지 M0에서 확인 필요. 없으면 컨테이너 재시작 시 배경 이미지 소실 → Dockerfile·compose 수정 1회.

### 10.3 OKLCH vs hex 변환
기존 코드가 OKLCH, 관리자 폼은 hex 입력이 직관적. 저장은 hex로 통일. 변환 불필요 — CSS 변수에 hex 주입하면 그대로 Tailwind에서 동작.

### 10.4 마퀴 애니메이션 속도
`animate-marquee 20s linear infinite` 고정. 본 스코프에서 편집 대상 아님 (공수 vs 가치 낮음).

### 10.5 이미 빌드된 이모지 픽커 없음
`emoji-mart` 패키지 미설치. 설치 필요 (`~100KB`). 대안: 관리자가 OS 이모지 키보드로 직접 입력 (`<Input>` 하나). 후자가 공수·번들 작음 — **후자 추천**.

### 10.6 CTA 버튼 배경 오버라이드와 기존 스타일 충돌
현재 CTA는 `bg-white`. 만약 관리자가 `overrideCtaBg`로 민트를 넣으면 내부 텍스트(`text-slate-800`)가 가독성 애매. M7에서 대비(Contrast ratio) 경고 표시 추가.

### 10.7 싱글 홍보물 슬라이더와 배경 동영상 공존
배경 동영상이 돌아가는 동안 1분 뒤 PromotionSlider가 뜨면 UX 카오스. 결정 필요: **배경 동영상이 있으면 자동 홍보물 팝업을 비활성화**하는 것이 자연스러움. 본 스코프에서는 관리자 판단에 맡기되, 홍보물 파일을 비워두면 됨 (기존 동작). 별도 토글 추가는 보류.

---

## 11. 폴백 정책

| 상황 | 동작 |
|---|---|
| `site_config` row 없음 | `updateSiteConfig` 초기 insert (id=1, 전부 default) |
| `backgroundPath` 있지만 파일 없음 | 배경 렌더 스킵, 자동 OFF 규칙 해제 (라바램프 복귀) |
| 색상 hex 파싱 실패 | Zod 레벨에서 차단, DB에는 invalid 값 유입 불가 |
| `marqueeItemsJson` 파싱 실패 | try/catch → default 배열 사용 |
| `kioskGridCols` 범위 밖 | Zod에서 차단, runtime은 `clamp(2, 5)` 방어 |

---

## 12. 구현 순서 요약

```
M1 → M2 → M3 → (M4 ∥ M5 ∥ M6) → M7 → M8 → M9
       하드코딩 치환     페이지별 바인딩 & 업로드     폼         미리보기      QA
       (이게 제일 지저분)
```

M2(CSS 변수 치환)가 가장 리스크 큰 단계. **이게 깨지면 M4·M5가 다 꼬임**. M2 완료 시 시각 회귀(눈으로 확인) 필수.

---

## 13. 체크리스트 (본격 실행 전 확인할 것들)

- [ ] `docker-compose.yml`에 `./public/uploads:/app/public/uploads` 볼륨 바인드 확인
- [ ] `.dockerignore`에 `public/uploads/` 제외 규칙 있는지 (빌드 시 들어가면 안 됨)
- [ ] Tailwind v4 alpha 조합 matrix 실측 (M2 blocker)
- [ ] `/admin/theme` 페이지에 ADMIN role gate 적용 (기존 admin layout의 미들웨어/가드 재활용)
- [ ] 관리자 편집 시 `next-pwa` 캐시 충돌 가능성 점검 (기존 `public/sw.js` 있음) — 배경 이미지 캐싱 정책 확인
- [ ] 홈 CTA `router.refresh()` 제거 or preview mode에서만 억제

---

## 14. Out of scope (명시적으로 지금 안 함)

- 폰트 변경 (큐레이션 패밀리 스위치)
- 다크 모드 (next-themes는 설치되어 있지만 스킨 편집 대상 아님)
- 관리자용 히스토리/버전 롤백 (편집 이력 테이블)
- 접근성(AA) 자동 수정 (경고만 표시, 강제 차단 X)
- 기관 로고를 실제 favicon·PWA manifest에 반영 (현재는 홈 상단 이미지로만)
- 다국어 (i18n)
- 드래그 앤 드롭으로 스티커 위치 조정
- 마퀴 애니메이션 속도 조절
