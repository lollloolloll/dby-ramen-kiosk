---
slug: dbase-themebuilder-v2
title: D.Base 인스턴스용 ThemeBuilder v2 완료
status: in_progress
created: 2026-05-16
updated: 2026-05-16
---

# Thread: D.Base 인스턴스용 ThemeBuilder v2 완료

## Goal

D.Base(도봉구청소년문화의집) 인스턴스를 띄울 수 있는 상태로 ThemeBuilder를 마무리한다. Aurora 비주얼 전면 적용, RentalDialog 색 토큰화, schema 다이어트+신규 필드, 그리드 가독성 점검, 데모 페이지 정리, 아이템 기본 이미지 시스템 추가.

상위 컨텍스트는 메모리 참조: [[project-context]], [[project-themebuilder-v2]], [[project-cart-flow-pending]].

## Context

### 이미 끝난 것 (B)
- `src/components/visuals/AuroraBackground.tsx` 구현 — 드래그 인터랙션만, 탭 액션 없음
- `src/components/visuals/ParticleWaveBackground.tsx` 구현 (백업/비교용)
- 홈 `src/app/page.tsx`에 `?bg=aurora|wave|lava` 쿼리 토글 배선 완료
- 색은 `config.colorPrimary → core`, `config.colorAccent → fringe`로 자동 매핑
- `/visual-test` 비교 페이지 — 비교 끝났으므로 **제거 예정**

### 합의된 schema 변경
- **제거**: `showLavaLamp`, `marqueeItemsJson`, `stickerEmojisJson` (쌍청문 전용 비주얼 필드)
- **추가**: `visualPreset: "lava" | "aurora" | "none"` (관리자 폼에는 노출 X, seed로만)
- **추가**: `defaultItemImagePath` (text, nullable) — 아이템 이미지 없을 때 폴백
- migration 필요. 쌍청문 인스턴스 seed = `'lava'`, D.Base seed = `'aurora'`

### 결정된 작업 순서
1. **C (RentalDialog 토큰화) 먼저** — 카트 흐름 리팩터([[project-cart-flow-pending]])가 같은 파일을 만지므로 충돌 방지
2. 그 다음 visualPreset 컬럼+migration, ThemeBuilder UI 정리
3. 마지막에 default item image 업로드 라우트 + 폼 + 아이템 카드 폴백 렌더

### 미해결·짚어야 할 것
- **확인됨 — kiosk 헤더 반응형 깨짐**: `KioskPageClient.tsx:230-292`. 타이틀이 `absolute left-1/2 + text-5xl whitespace-nowrap`이라 좌(홈으로)/우(카테고리 필터) 요소와 겹침. 좁은 뷰포트에서 텍스트도 안 줄어듦. 해결: 타이틀 `absolute` 제거 → flex item `flex-1 min-w-0 text-center`, 폰트 `text-3xl md:text-4xl lg:text-5xl`, 필터 영역 `overflow-x-auto` 또는 줄바꿈, 매우 좁으면 2단 스택
- 아이템 다수일 때 grid 자체는 미검증 (사용자 추정으로는 OK)
- 배경 이미지/영상 업로드와 aurora 동시 사용 충돌 — 현재 `hasBackground`면 aurora 자동 OFF. D.Base에선 aurora만 쓸 거면 OK. 의도 재확인
- KioskPageClient는 아직 aurora 미배선 (홈만 됨)

## References

- 메모리: `~/.claude/projects/.../memory/MEMORY.md`
- 기존 ThemeBuilder PLAN.md: `.planning/theme-builder/PLAN.md` (~540줄, 일부 stale)
- D.Base 사이트: https://dbase.or.kr
- 비주얼 컴포넌트: `src/components/visuals/`
- 색 하드코딩 위치: `src/components/item/RentalDialog.tsx` (oklch 63개)
- site_config schema: `drizzle/schema.ts`, `src/lib/schemas/siteConfig.ts`
- 업로드 라우트 패턴: `src/app/api/uploads/background/route.ts`, `logo/route.ts` (참고)

## Next Steps

다음 세션 시작 시 이 순서로:

1. **kiosk 헤더 반응형 수정** — 위 "확인됨" 참고. 타이틀 absolute 제거 + 반응형 폰트 + 필터 스크롤
2. **C — RentalDialog 토큰화** 시작
   - oklch 하드코딩 63개를 `--brand-primary`/`--brand-accent` (+ alpha 변형) CSS 변수로 치환
   - 일부는 `bg-brand-primary/20` 같은 Tailwind 토큰으로, alpha 조합이 까다로운 건 `color-mix()` fallback
   - `/admin/theme`에서 색 바꿔도 다이얼로그까지 즉시 반영되는지 검증
3. **KioskPageClient에도 aurora 배선** — 홈 page.tsx 패턴 그대로 복제
4. **D — visualPreset + defaultItemImagePath 컬럼 추가**
   - Drizzle migration
   - `src/lib/schemas/siteConfig.ts` zod 스키마 갱신
   - 인스턴스별 seed (쌍청문=lava, D.Base=aurora)
   - 아이템 카드 렌더에서 `item.imagePath ?? siteConfig.defaultItemImagePath ?? placeholder` 폴백 체인
5. **E — ThemeBuilder UI 정리**
   - 죽은 필드(showLavaLamp 토글, 마퀴 입력 등) 제거
   - default item image 업로드 섹션 추가 (`/api/uploads/default-item/` 라우트 신규)
   - visualPreset은 폼에 노출 X
6. **/visual-test 폴더 제거**
7. **검증**
   - 홈/키오스크에서 aurora 정상 렌더
   - RentalDialog 열어 색이 brand-* 반영되는지 확인
   - 색 변경 시 다이얼로그 + 메인 다 따라오는지
   - 아이템 이미지 없을 때 default image 표시
   - 그리드 가독성 OK
