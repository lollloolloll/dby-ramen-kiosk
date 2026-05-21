---
slug: dbase-themebuilder-v2
title: D.Base 인스턴스용 ThemeBuilder v2 + 디자인 새로 만들기
status: in_progress
created: 2026-05-16
updated: 2026-05-21
---

# Thread: D.Base 인스턴스용 ThemeBuilder v2 + 디자인 새로 만들기

## Goal

D.Base(도봉구청소년문화의집) 인스턴스를 띄울 수 있는 상태로 ThemeBuilder를 마무리하고, 홈/키오스크 화면을 D.Base 전용 디자인으로 새로 그린다. 기존 옛 디자인의 잔재(라바램프·스티커·마퀴·기울인 헤드라인)는 완전히 제거.

상위 컨텍스트는 메모리 참조: [[project-context]], [[project-themebuilder-v2]], [[project-cart-flow-pending]].

## 이미 완료 (이전 단계)

- AuroraBackground / ParticleWaveBackground 컴포넌트
- visualPreset / defaultItemImagePath 컬럼 + zod schema + ThemeBuilder UI 정리
- RentalDialog 118개 oklch 토큰화 (brand-* CSS 변수)
- ItemCard 폴백 체인 + 토큰화
- Badge 토큰화 (available/rented)
- BroadcastChannel cross-tab 동기화
- 배경 색상 컬럼 (`colorBackground` → `--brand-bg`)
- 선택적 텍스트 필드 빈 값 허용 (homeBadge1/2, homeSubcopy, kioskEmpty*)
- 시드 스크립트 (scripts/seed-items.mjs, 15개)
- ThemeBuilder UI 1차 단순화 (메인 3카드 + 고급 collapsible)

---

## SPEC v1 — 디자인 새로 만들기 (현재 단계)

### 합의된 옵션: B

**디자인만 새로. 기능은 기존 재활용. 새 기능 필요하면 사용자에게 질문.**
카트는 보류 (다음 단계).

### 1. 사용자

- 4층 건물 라운지 청소년
- 친구와 함께
- 1대당 1분 내외 빠른 사용
- 단골 비율 ↑
- 디바이스: 태블릿 (가로 또는 세로)

### 2. 핵심 잡

"그 층의 대여물품을 빠르게 확인하고 빌린다."

### 3. 시각 톤

- "최근 지어진 건물 / 정돈 / 신기 / 현대적"
- D.Base 사이트(https://dbase.or.kr) 톤: 파스텔, 청소년 친화, 정돈된 그래픽, "Dream. Be / Assist / Start / Experience"
- 톤 결정은 **frontend-design 스킬에 위임** — refined minimal / editorial / soft pastel 사이
- Aurora 셰이더 배경에 유지 (탈부착 가능, `visualPreset` enum)

### 4. 명시적으로 제거 — 옛 쌍청문 잔재

- FloatingSticker (회전·bounce·키치)
- MarqueeText (`-rotate-1`)
- 글래스모피즘 `bg-white/60 backdrop-blur` 뱃지
- 가운데 큰 그라데이션 텍스트 헤드라인 ("학교 끝나고 / 뭐하고 놀래?" 톤)
- "화면 아무 곳이나 터치하세요" + 전체 영역 클릭 → 명시적 시작 버튼
- 살짝 기울인 요소 (`rotate-*`)

### 5. 인스턴스 구분

- **`NEXT_PUBLIC_FLOOR`** 환경변수 도입 (예: `2`)
- 카탈로그 필터링은 **강제 X** (옵션). 운영자가 카테고리에 "2층/..." prefix 넣으면 자연스럽게 분리되지만 강제하지 않음
- 추후 토글로 필터 강제 가능

### 6. 화면 흐름 (기능 변경 없음)

- 대기 (`/`) → 시작 → 카탈로그 (`/kiosk`) → 아이템 카드 탭 → RentalDialog (기존 단건 흐름 그대로) → 등록
- PromotionSlider 자동 발동 유지
- 비활성 60초 타이머 유지

### 7. 화면별 명세

**대기 (`/`)**

- 필수: 층 표시 (env 있을 때만), 환영/안내 짧은 한 줄, **명시적 시작 버튼**, aurora 또는 단색 배경, 작은 admin/fullscreen 링크, 로고
- 금지: 가사형 헤드라인, 마퀴, 스티커, 전체 영역 클릭

**카탈로그 (`/kiosk`)**

- 필수: 헤더(홈으로 + 페이지 제목 + 카테고리 필터, 반응형), 아이템 그리드, 빈 상태 메시지, 카드 탭 → RentalDialog
- 금지: 카드 hover scale 과한 모션, 회전 변형

**등록 후 (영수증 자리)**

- 별도 페이지 만들지 않음. 기존 RentalDialog 안의 완료 단계가 "OO, OO를 빌렸어요" 정도만 보여주고 자동 복귀
- **반납 안내 X** (반납 로직 없음)

### 8. 살릴 기존 기능 (절대 변경 금지)

- `useTheme` (config 자동 반영)
- `useSearchParams` (?bg= 등 dev override)
- `resolveVisualMode` / `resolveWaveMode` 헬퍼
- `AuroraBackground` / `ParticleWaveBackground` 컴포넌트
- `ItemCard` (chrome은 디자인에 맞게 다듬어도 됨, 폴백 체인은 유지)
- `RentalDialog` (열림/닫힘 props만 호출, 내부 로직 그대로)
- `PromotionSlider` 자동 발동
- `processAndMutateExpiredRentals`
- 비활성 60초 타이머 (`config.inactivityTimeoutMs`)
- middleware (admin 경로 보호)
- BroadcastChannel 동기화 (`ThemeProvider`)

### 9. 기술 제약

- Next.js 15 App Router + Turbopack
- Tailwind v4 (`@theme inline`, `bg-(--brand-bg)`, `text-(--brand-primary)` 형식)
- 색은 **반드시 `var(--brand-*)` CSS 변수 사용** (관리자 컬러피커 자동 반영)
- 폰트 추가 OK (next/font/google 권장, distinctive 선택)
- React Server vs Client 컴포넌트 적절히 분리
- 옛 쌍청문 인스턴스도 같은 코드 쓰는 점 인지 — `visualPreset='lava'` row가 살아있어도 깨지지 않게

### 10. 산출물

- `src/app/page.tsx` 교체 (옛 디자인은 git history에 보존)
- `src/app/(kiosk)/kiosk/KioskPageClient.tsx` 교체
- 필요시 새 컴포넌트 `src/components/dbase/...`
- 새 폰트 import (`src/app/layout.tsx` 또는 별도)

### 11. 비범위 (B 옵션 한정)

- 카트 / 다건 대여
- 반납 로직
- 새 DB 컬럼
- 새 API 라우트
- admin 페이지 디자인 변경

### 12. 완료 조건

- [ ] FloatingSticker / MarqueeText / 회전 변형 코드 0건
- [ ] `bg-white/60` 글래스 뱃지 패턴 0건
- [ ] 그라데이션 텍스트 헤드라인 제거
- [ ] D.Base 톤(파스텔·정돈·현대적) 시각적으로 확인 가능
- [ ] 사용자에게 "기존 느낌 안 남" 합격 받음
- [ ] 색만 바꿔도 톤이 자동으로 따라옴
- [ ] 태블릿 가로·세로 모두 깨짐 없음
- [ ] `npx tsc --noEmit` 통과
- [ ] RentalDialog 기능은 그대로 호출됨 (기존 사용자 흐름 유지)

---

## References

- 메모리: `~/.claude/projects/.../memory/MEMORY.md`
- D.Base 사이트: https://dbase.or.kr
- 비주얼 컴포넌트: `src/components/visuals/`
- 기존 page.tsx (참고용, 곧 교체): `src/app/page.tsx`
- 기존 kiosk: `src/app/(kiosk)/kiosk/KioskPageClient.tsx`
- 시드: `scripts/seed-items.mjs`

## 진행 로그 (2026-05-16 세션 2)

### 완료된 것 (DESIGN.md PlayStation 시스템 기반 재작성)

- `src/app/layout.tsx`: Bricolage Grotesque(display, --font-display) + Pretendard Variable(CDN, --font-sans) 추가
- `src/app/globals.css`: `--font-display`, surface 토큰(`--surface-card`, `--surface-soft`, `--hairline`, `--hairline-strong`, `--body-muted`), brand alpha 변형(-04~-60) 추가
- `src/app/page.tsx`: **완전 재작성**. PS hero band 스타일. weight 300 display 헤드라인. 상단 dark nav strip + 하단 brand-primary footer band. **시작 버튼 제거 → 화면 전체 클릭으로 /kiosk 진입** (`onClick={handleStart}` + cursor-pointer). "화면을 터치하여 시작" 마이크로 라벨. LiveClock 컴포넌트.
- `src/app/(kiosk)/kiosk/KioskPageClient.tsx`: **완전 재작성**. dark nav + light canvas 카탈로그 + brand footer. 카테고리 pill 필터. **사용자가 직접 카트 흐름 구현**: `cart` state, `toggleCart`, `handleCheckout`, 하단 플로팅 "대여하기 →" 바, `inCart` 표시.
- `src/components/item/ItemCard.tsx`: PS game-tile 스타일(8px radius, flat, 이미지 70%). **사용자가 onAddToCart/inCart props 추가** (카트 담김 시 체크 오버레이 + ring).
- **검정 하드코딩 제거**: `bg-black`/`text-white`/`border-white` → `bg-(--brand-text)`/`text-(--brand-bg)`/`border-(--brand-bg)`. → 운영자가 ThemeBuilder "글자 색"(hero/nav 배경)·"페이지 배경"(글자색)으로 직접 제어.
- **Aurora 마우스 드래그 제거**: page.tsx/KioskPageClient 양쪽 `<AuroraBackground>`에서 `interactive` prop 제거. 자율 드리프트만.
- **ThemeBuilder에 배경효과 컨트롤 추가**: 이미지와 레이아웃 카드 → "배경 효과" 4버튼(오로라/웨이브/그라데이션/끄기) = `visualPreset` 직접 선택.
- **RentalDialog 카트 모드 버그 수정**: `if (!item) return null` → `if (!item && !isCartMode) return null`. 완료 화면 `{item.name}` → cart 모드면 `${cartItems.length}개 물품`. (카트 분기 로직 isCartMode/551/841/903은 사용자가 이미 구현해둠)

### 결정 완료 (2026-05-20)

- **"개인정보 확인" = 회원정보 수정**을 뜻함 (사용자 명확화). 이미 RentalDialog 안 `edit` 액션(`IdentificationAction = "rent" | "edit"`)으로 구현돼 있음 → **모달 유지로 확정.** 위치 결정/리팩터 불필요.

## 진행 로그 (2026-05-21 세션 3 — 비주얼 버그 + ThemeBuilder 보강)

### 버그 수정 (3건, 모두 정적 분석으로 root cause 확정)

- **3D 오브젝트 안 보임 (a)**: `AuroraBackground.tsx`/`ParticleWaveBackground.tsx`의 `animate()`가 `if(paused) return`을 `renderer.render()` 앞에서 해서 미리보기(`paused=isPreview`)가 단 한 프레임도 안 그려 빈 화면. → **항상 렌더하되 시간 진행만 멈춤**으로 수정.
- **3D 안 보임 (b) + 옵션-데이터 불일치**: `KioskPageClient.tsx`에 `visualMode==="lava"` 분기가 없었음(home엔 있음). 기본 visualPreset이 lava라 kiosk가 기본값에서 아무 효과도 안 그림. → home과 동일한 그라데이션 블롭 lava 분기 추가. 이제 4개 효과 전부 kiosk·home에서 렌더.
- **글자색/배경 매치**: footer·카트바·활성 카테고리 pill이 `--brand-primary` 위 **흰색 하드코딩** → 파스텔 primary면 안 보임. → `theme-utils.ts`에 `getReadableTextColor()`(WCAG 휘도) + `--brand-on-primary`/`--brand-on-cta` CSS 변수 추가, 하드코딩 white를 `var(--brand-on-primary)`로 교체. `globals.css`에 기본값 추가(FOUC 방지).

### default 값 정리 (`src/lib/schemas/siteConfig.ts` `defaultSiteConfigValues`)

- **텍스트**: 옛 쌍청문 가사형 → 담백·중립. orgName 라운지 / homeBadge1·2·subcopy 비움 / headline "필요한 물품"·"간편하게 대여" / ctaLabel "시작하기" / kioskTitle "대여 목록". (kioskEmpty·marquee·sticker 유지)
- **레거시 토글**: `showLavaLamp`/`showStickers`/`showMarquee` true→false (옛 제거된 컴포넌트용 죽은 값).
- **visualPreset**: `lava` 유지 (사용자 결정 — lava가 낫다).
- ※ 주의: default는 *신규 인스턴스 초기값*만. 기존 쌍청문/D.Base는 DB값 사용하므로 화면 영향 없음.

### ThemeBuilder 보강 (`ThemeBuilderClient.tsx`)

- **색 모델 직관성**: 색 라벨 재정의 — "글자 색"→"메인 톤(어두운 색 권장)", "페이지 배경"→"배경 톤(밝은 색 권장)" + helper에 이중역할 명시. (사용자 결정: 라벨 재정의 방식. 색 역할 분리·클릭편집은 보류)
- **옛 helper 예시 갱신** (학교 끝나고/😎 등 → 새 default 톤).
- **색 프리셋 팔레트 추가**: `COLOR_PRESETS` 4종(파스텔/모던 다크/모노 미니멀/웜 선셋), 메인톤↔배경톤 대비 검증 완료. "색상" 카드 상단 버튼 행, 클릭 시 색 5개(primary/accent/textMain/textMuted/background) 일괄 setValue. 배경효과·문구는 안 건드림.

### 보류 (다음 후보)

- **대비 안전 경고**: 메인톤/배경톤/포인트색 대비 실시간 체크 → "글자 안 보일 수 있음" 경고. (자동대비의 연장)
- **미리보기 클릭 → 요소 색 편집**: iframe 양방향 통신 필요한 큰 기능. 색 커플링(메인톤=글자+배경) 먼저 정리됐으니 이후 설계 가능.
- **죽은 컨트롤 정리**: 고급설정 "홈 큰 글씨 그라데이션 시작/끝색"이 새 디자인(헤드라인 단색 포인트)에서 안 먹는지 확인 후 제거 검토.

### 검증 (2026-05-21, WSL 정적 확인만)

- 매 단계 `npx tsc --noEmit` 통과 (exit 0).
- **실동작(브라우저) 미검증** — Windows에서 사용자 확인 필요: (1) ThemeBuilder 프리셋 4개 미리보기 즉시 반영, (2) 어떤 프리셋에서도 nav·footer 글자 안 깨짐, (3) 배경효과 4개 home·kiosk 모두 렌더, (4) 모던 다크 다크테마 적정성.

## Next Steps (다음 세션)

1. **Windows 실동작 검증** — 위 4개 + 카트 흐름(카드 탭→담김→대여하기→모달 카트모드→등록). Claude는 WSL 실행 금지(환경 메모 참조).
2. 비주얼 사용자 합격 확인 (D.Base 톤 / 태블릿 가로·세로 / 폰트 weight 300 한글 가독성)
3. 보류 항목 중 택1 (대비 경고 / 클릭편집 / 죽은 컨트롤 정리)
4. (이후) 운영자 편집 범위, 실패 모드 검토

### 코드 검증 완료 (2026-05-20, WSL에서 정적 확인만)

- `npx tsc --noEmit` 통과 (exit 0)
- 옛 디자인 잔재 0건: FloatingSticker/MarqueeText/`rotate-*`/`bg-white/60` 글래스/그라데이션 텍스트 (page.tsx, KioskPageClient.tsx)
- 카트 체인 정합성 OK (props·액션 연결 확인)
- **실동작(브라우저) 검증은 미완** — Windows에서 사용자가 확인 필요

## 환경 메모 — **Windows 전용 런타임 (2026-05-20 확정)**

- **이 프로젝트는 Windows에서만 실행/테스트한다.** Claude(WSL)는 `npm run dev`/`npm install`/`npm rebuild`를 절대 돌리지 않는다. 코드 편집 + `npx tsc --noEmit` + git만. 실행·브라우저 검증·런타임 에러 진단은 전부 사용자가 Windows에서.
- **이유 (2026-05-20 실제 사고):** node_modules/.next를 Windows·WSL이 공유 → WSL에서 작업하면 (1) better-sqlite3 .node가 Linux ELF로 리빌드돼 Windows에서 `invalid ELF header` 500, (2) npm install이 package.json/lock 줄바꿈 CRLF→LF로 오염, (3) WSL `next dev`가 `.next`에 Linux 산출물 만들어 Windows turbopack과 `File exists (os error 17)` 충돌 500. 복구: `git checkout package.json package-lock.json` + `rm -rf .next` + 사용자가 Windows npm i.
- Windows 네이티브 바이너리는 정상 확인됨: better-sqlite3(PE32+), lightningcss-win32-x64-msvc, @tailwindcss/oxide-win32-x64-msvc, bcrypt win32-x64 prebuild.
- 메모리: [[windows-only-runtime]]
- (옛 노트, 폐기) ~~linux 바이너리 추가 설치~~ — Windows 전용 결정으로 무효. optionalDependencies의 linux 항목은 Windows에서 자동 skip되므로 무해.
