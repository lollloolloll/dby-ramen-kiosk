# D.BASE Cart Flow Implementation Plan

## Goal

D.BASE 키오스크를 와이어프레임대로 `신규/재방문 → 인원수 → 컨텐츠 다중 선택 → Welcome` 흐름으로 완성하고, 방문 인원 분포와 선택 컨텐츠를 DB에 보존한다.

## Scope

- `/kiosk/dby`는 D.BASE state machine UI를 직접 렌더한다.
- `/kiosk/smy`는 기존 카탈로그 + `RentalDialog` 흐름을 유지한다.
- `/kiosk`는 호환을 위해 `/kiosk/dby`로 redirect한다.
- ThemeBuilder 색상/배경/Aurora 자산은 재사용한다.
- `schoolGrade` 컬럼은 추가하지 않고, 신규 등록은 생년월일 기반으로 처리한다.

## Implementation Tasks and Verification

### 1. Headcount Validation

- Add `src/lib/dbase/headcount.ts`.
- Rule: `totalCount === youthMale + youthFemale + adultMale + adultFemale`.
- Verification: `node --test src/lib/dbase/headcount.test.mjs` passes.

### 2. Data Model

- Add `visit_sessions` table.
- Add nullable `rental_records.visit_session_id`.
- Keep existing rental records valid with `visit_session_id = null`.
- Verification: `npx tsc --noEmit` type-checks schema references. DB push/migration is Windows-side.

### 3. Server Actions

- Add D.BASE-specific registration that stores existing `general_users` fields only.
- Add D.BASE visit commit action:
  1. validates headcount,
  2. creates one visit session,
  3. creates one rental record per selected content,
  4. links all records to the session.
- Verification: TypeScript compile plus focused code review against schema.

### 4. Admin Record Visibility

- Add preserved D.BASE visit headcount fields to rental-record query.
- Show D.BASE visit distribution in the admin records table.
- Verification: `node --test src/lib/dbase/session.test.mjs` plus focused TypeScript compile.

### 5. D.BASE UI Flow

- Add `DbaseKioskFlow` client component.
- Steps:
  1. entry: 처음 왔어요 / 또 왔어요,
  2. register or identify,
  3. headcount,
  4. content multi-select,
  5. done.
- Verification: TypeScript compile and visual/manual check on Windows dev server.

### 6. Kiosk Entry

- Render `DbaseKioskFlow` directly from `/kiosk/dby`.
- Restore the legacy `RentalDialog` catalog flow under `/kiosk/smy`.
- Use App Router URL segments for D.BASE/SMY separation; do not add env/orgName flow detection.
- Redirect `/kiosk` to `/kiosk/dby` for backward compatibility.
- Verification: focused TypeScript compile confirms route pages and client props are aligned.

## Windows-Only Checks

The agent must not run `npm run dev`, `npm install`, `npm rebuild`, or DB push from WSL. After code verification, the user runs these on Windows:

- `npm run db:push`
- `npm run dev`
- Manual kiosk flow smoke test
