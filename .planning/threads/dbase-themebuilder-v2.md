---
slug: dbase-themebuilder-v2
title: D.Base 인스턴스용 ThemeBuilder v2 + 디자인 새로 만들기
status: in_progress
created: 2026-05-16
updated: 2026-05-16
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

## Next Steps

1. **frontend-design 스킬 호출** — 위 SPEC을 인풋으로
2. 산출 코드를 page.tsx / KioskPageClient.tsx에 적용
3. tsc 검증
4. 사용자 비주얼 확인
5. 통과 시 다음 단계 (운영자 편집 범위 검토, 실패 모드 검토, 카트 흐름)
