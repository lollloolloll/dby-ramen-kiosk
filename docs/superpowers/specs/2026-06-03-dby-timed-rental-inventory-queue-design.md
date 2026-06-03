# D.Base 시간제 대여 · 재고(수량) · 대기열 · 관제탑 — 설계 스펙

- 작성일: 2026-06-03
- 상태: 설계 합의 완료, 구현 계획(writing-plans) 대기
- 배포 전제: **이 배포는 D.Base 전용**(`/kiosk/dby`). smy(`/kiosk/smy`)는 이 배포에서 미사용 — 단 admin·`items`·서버 액션 코드는 공유.

## 1. 배경 / 문제

- D.Base 키오스크는 콘텐츠(아이템) 수량이 한정되어 있고, 인기 아이템에 사람이 몰린다.
- **반납 전용 키오스크가 없다.** 사용자가 직접 반납하지 않으므로, 한정 수량을 다시 풀어주는 유일한 수단은 **시간 만료 자동 반납**이다. → 시간제 대여가 dby에 필수.
- 현재 dby는 "대여/점유" 개념이 전혀 없다: `commitDbaseVisit`가 방문 기록을 `isReturned: true`(즉시 반납)로 남기는 **로그 전용**(`src/lib/actions/dbase.ts:157-176`). 시간/수량/대기열 미반영.

## 2. 목표 / 비목표

**목표**
- 아이템별 **보유 수량 N**(재고 유닛)과 **시간제 점유(hold)** 도입. **점유 단위 = 대여 1건 = 1**(그룹이 4명이든 5명이든 **1로 카운트**, 인원수 무관). **잔여 = N − 활성 대여 건수**(미반납 rental_record COUNT). 인원수(`maleCount/femaleCount`)는 기록·표시용일 뿐 점유 계산엔 미반영.
- 잔여>0이면 즉시 이용, 0이면 **대기열 등록**. 시간 만료 시 자동 반납 + 다음 대기자 자동 승급.
- 키오스크 **"내 차례 확인"**(아이들 self-check 필수).
- staff **관제탑**(`/admin/waitings` 확장): 아이템별 점유 n/N · 잔여 · 대기 m · 다음 반납예정.
- **캐시/신선도는 smy 패턴 이식**으로 "UI 항상 최신" 보장.

**비목표**
- smy(`/kiosk/smy`) 동작 변경/유지보수 (배포에서 미사용).
- 반납 키오스크/사용자 모바일 알림.
- 백그라운드 크론(별도 인프라). 만료 처리는 조회/lazyCheck/액션 트리거로 수행.
- **동시성/트랜잭션 기반 정합성** — 미고려(저부하 키오스크 전제, 사용자 결정). tx·락 미사용, 순차 실행.
- 관제탑 실시간 자동갱신 — smy 그대로(자동갱신 없음) 채택. 라이브 갱신은 추후 옵션.

## 3. 현재 동작 (코드 검증됨)

- `commitDbaseVisit`: visitSession + rentalRecords(즉시 `isReturned:true`) 기록. 시간/수량/대기열 무관. revalidate는 `/`, `/kiosk/dby`, `/admin/records`만.
- smy 인프라(재사용 대상):
  - 스키마 `rental_records`에 `returnDueDate`, `isReturned`, `returnDate`, `isManualReturn` 존재.
  - `waiting_queue`(itemId, userId, requestDate, maleCount, femaleCount) 존재.
  - `rental.ts`: `returnDueDate = rentalDate + rentalTimeMinutes*60`; **`processAndMutateExpiredRentals()`**(만료 자동반납+승급, revalidate 없음 — "렌더 중 안전"); **`triggerExpiredRentalsCheck()`**(동일+`revalidatePath("/", "layout")`, 서버 액션 전용); **`processNextInQueue(itemId)`**(1순위 대기자 큐 삭제 + **rental_record 생성**); `getActiveRentalsWithWaitCount`(아이템별 활성대여+대기자수, **다건 나열 가능**).
  - **만료 트리거 = 목록 조회에 내장**: `getAllItems({skipProcess})`(`item.ts:61`)가 `processAndMutateExpiredRentals()` 호출. **`/kiosk/dby/page.tsx`가 이미 `getAllItems` 사용 → dby에 만료 트리거 기존 연결됨.** 모든 admin 페이지·`/`도 렌더 시 동일 호출. 변경 액션(rent/return/queue)은 `triggerExpiredRentalsCheck()` 사용(rental.ts:68,224; waiting.ts:24,228).
  - **lazyCheck(유휴 폴링)**: `PromotionSlider`가 프로모션/유휴 화면에서 `onLazyCheck`를 최초 1회 + **60초마다** 호출(`PromotionSlider.tsx:39,101,106`, `lazyCheckInterval` 기본 60s). `handleLazyCheck` = `processAndMutateExpiredRentals()`(home `page.tsx:198`, smy `KioskPageClient.tsx:211`). → **유휴 중 만료 자동처리/승급**.
  - 정리: 신선도 = force-dynamic + 렌더 시 만료처리(getAllItems) + **유휴 시 60초 lazyCheck** + 액션 시 revalidate + 클라 마운트 `router.refresh()`. (active 카탈로그 화면 자체엔 폴링 없음; **관제탑(admin)엔 lazyCheck 없음**)
  - `/admin/waitings`: 활성대여 + 대기열 목록(현재 staff 액션 후 `router.refresh()`만, 폴링 없음). `force-dynamic`.
- **smy의 1유닛 가정 지점**: 대여 시도 경로의 "사용 중이면 차단", `getCurrentRenter`의 `limit(1)`, `maxRentalsPerUser`를 "사용자별 일일 한도"로 사용(`rental.ts`에서 `count >= maxRentalsPerUser` 차단).
- 페이지 캐시: `/kiosk/dby`, `/kiosk/smy`, `/admin/waitings` 모두 `export const dynamic = "force-dynamic"`.

## 4. 데이터 모델

- **보유 수량**: `items.max_rentals_per_user` **컬럼 재사용**(라벨만 "보유 수량(재고)"으로). 마이그레이션 0. dby 전용 배포라 의미 충돌 영향 없음.
  - 주의: 같은 컬럼을 smy 코드는 "사용자별 한도"로 읽음. dby commit 경로가 **smy 한도 체크 로직을 타지 않도록** 분리 필수(§9).
  - 값 미설정(null) 시 기본 수량 정책 결정 필요: 시간제인데 수량 미입력이면 N=1로 간주(추천).
- **점유 기록**: 기존 `rental_records` 사용. 시간제 hold = `isReturned:false` + `returnDueDate` 설정. 비시간제 = 현행 `isReturned:true`.
- **대기열**: 기존 `waiting_queue` 사용. requestDate 순. 승급 시 maleCount/femaleCount를 hold로 이관.
- 스키마 신규 컬럼/테이블 없음.

## 5. 키오스크 흐름 (멀티선택 유지 + 시간제만 분기)

- 기존 등록/식별 → 인원수 → 멀티선택 → commit 유지 (`DbaseKioskFlow`).
- **신규 dby commit 서버 액션**(또는 `commitDbaseVisit` 확장)에서 아이템별 분기 — **순차 처리(트랜잭션 미사용)**. 기존 `commitDbaseVisit`의 `db.transaction`도 제거하고 smy `processNextInQueue`식 순차 실행을 따른다:
  1. 비시간제 → 방문 로그(현행 `isReturned:true`). **수량/대기열 미적용**(반납 개념이 없어 시간제에만 적용 — 확정).
  - **활성 점유수 = 해당 아이템의 미반납 rental_record 건수(1대여=1, 인원수 무관).**
  2. 시간제 & (활성 점유수 < N) → hold 생성(`isReturned:false`, `returnDueDate = now + rentalTimeMinutes*60`).
  3. 시간제 & (활성 점유수 ≥ N) → `waiting_queue` 등록 (**`maleCount/femaleCount` 채워서** — 승급 시 이관용·기록용).
  - 가용성은 단순 조회 후 insert(순차, 트랜잭션·락 없음). **동시 commit 초과배정은 미고려**(저부하 키오스크 전제 — 결정됨, §10).
- **완료 화면**: 아이템별 결과 안내 — 예) "A·B 이용 시작(○○분) / C 대기 3번".

### 5.1 rental_record 생성 시점 (smy와 동일 — 확정)
- 즉시 대여(잔여>0): **그 순간** rental_record 생성(`isReturned:false`+`returnDueDate`).
- 만석→대기: **`waiting_queue`만, rental_record 없음.**
- 승급(`processNextInQueue`): 자리가 나서 **대여처리되는 그 순간** rental_record 생성(이미 구현). 이때 `waiting_queue`의 `maleCount/femaleCount`를 rental_record로 **이관**(`rental.ts:576-577`, 이미 구현) → **인원수 보존(UX 필수)**. 단 청소년·성인 세부분할/`visitSession`은 큐 경로엔 없음(남/여 수만 보존).
- 만료: 해당 record를 `isReturned:true`로 **갱신**(새 record 생성 아님).
- 비시간제: 현행처럼 즉시 record(`isReturned:true`).
- 결과: 대여기록엔 "실제 이용한 대여"만 남고, 대기만 하고 못 받은 건은 record 없음.

## 6. "내 차례 확인" (신규)

- `DbaseKioskFlow`에 **신규 step**(예: `mystatus`) 추가 + entry 화면에 진입 버튼. (별도 라우트 아님 — 기존 step 기반 단일 컴포넌트 구조에 맞춤)
- 인증 = **이름 + 전화 가운데 4자리**(기존 `identify` step 재사용, `findUsersByNameAndPin`).
- 표시: 해당 사용자의 (a) 현재 이용 중 아이템 + 남은 시간, (b) 대기 중 아이템 + 대기 순번 + 예상 시간("지금 이용 가능" 포함).
- 신규 서버 쿼리: userId 기준 활성 hold + waiting_queue 순번 계산. (smy에 없음 — 신규)
- `/kiosk/dby`는 `force-dynamic`(적용됨), 마운트 시 `router.refresh()`, 조회 시 만료 처리 트리거(§8).

## 7. 관제탑 (`/admin/waitings` 확장)

- 아이템별: **점유 n/N(대여 건수 기준, 1대여=1) · 잔여 · 대기 m건 · 다음 반납예정(카운트다운)**.
- staff 액션(기존 재사용): 수동 반납, 대기자 승급/호출 표시, 시간 연장(대기자 없을 때).
- `getActiveRentalsWithWaitCount`를 **아이템별 집계(점유수/N)** 형태로 보강. `getCurrentRenter`(limit1) → `getCurrentRenters`(목록).
- 갱신: **smy 그대로.** page render(force-dynamic) 시 만료 자동처리 + staff 액션 후 `router.refresh()`/revalidate + 마운트 시 `router.refresh()`. **관제탑엔 lazyCheck 없음**(lazyCheck는 키오스크/홈 유휴 전용) → staff가 보는 동안 자동 갱신을 원하면 §10의 클라 주기 refresh 옵션 필요.
- (선택) 카운트다운을 살아있게 보이려면 **서버 호출 없는 클라 전용 표시 ticker**만 추가(RentalDialog setInterval과 동일 종류). 자동반납 실제 반영은 다음 render/refresh 때. 무인 장시간 방치 시 자동해제 지연 가능(§10).

## 8. 만료·자동반납 + 캐시/신선도 (smy 패턴 이식)

- **페이지 `force-dynamic`**: `/kiosk/dby`(적용됨), `/admin/waitings`(적용됨), 신규 "내 차례 확인"도 적용.
- **모든 변경 액션에서 `revalidatePath`**: dby hold 생성/대기 등록/만료반납/승급/수동반납 시 smy 수준으로 — `revalidatePath("/", "layout")` + `/admin/waitings` + `/kiosk/dby` + `/admin/records`. (현 `commitDbaseVisit`의 부분 revalidate 보강)
- **만료 처리 재사용**: 렌더 경로는 `processAndMutateExpiredRentals()`(revalidate 없음, 안전), 서버 액션은 `triggerExpiredRentalsCheck()`(revalidate 포함). 트리거: `getAllItems()`(**dby 페이지가 이미 호출 — 추가 작업 없음**) + admin 페이지 렌더 + 변경 액션.
- **lazyCheck 적용(중요)**: dby 키오스크는 유휴 시 home(`/`)으로 복귀(`DbaseKioskFlow` inactivity → `router.push("/")` + `showPromotionOnHome`)하고, home의 `PromotionSlider`가 **60초마다 `processAndMutateExpiredRentals()`** 실행 → **유휴 무인 상태에서도 만료 자동반납+승급**. dby는 이걸 **공유 home을 통해 거의 공짜로** 얻음. (구현 시: dby 유휴→home→PromotionSlider lazyCheck 경로가 끊기지 않게 확인)
- **클라이언트 갱신**: 키오스크/내차례확인/관제탑 모두 smy처럼 **마운트 시 `router.refresh()`** + 액션 후 refresh. active 카탈로그/관제탑엔 타이머 폴링 없음(유휴 lazyCheck만 있음).
- 결과: 캐시 무효화(revalidatePath) + 렌더 시 만료처리 + 유휴 60초 lazyCheck = smy와 동일 → "UI 항상 최신" 보장.

## 9. smy 재사용 vs 신규 (그대로 복사 불가 지점)

| 영역 | smy 재사용 | 신규/변경 |
|---|---|---|
| 만료 자동반납+승급 | `processAndMutateExpiredRentals` / `triggerExpiredRentalsCheck` / `processNextInQueue` 그대로 | — |
| 유휴 lazyCheck/신선도 | `PromotionSlider` 60초 lazyCheck + force-dynamic + revalidate — **공유 home(`/`) 통해 dby 자동 적용** | 관제탑은 lazyCheck 없음(원하면 동일 패턴 추가) |
| 대기열+승급+인원수 이관 | `waiting_queue` + `processNextInQueue`(maleCount/femaleCount 이관 `:576-577`) 그대로 | 수량 N 고려해 "잔여 생기면 승급" 조건 확장 |
| 가용성 | — | **1유닛→N**: "활성 점유수 < N" 체크로 변경 |
| 현재 대여자 | — | `getCurrentRenter`(limit1) → `getCurrentRenters`(목록/카운트) |
| 수량 컬럼 | `max_rentals_per_user` 재사용 | 의미를 "보유 수량"으로, **smy 한도 체크 경로 미사용** |
| commit | rent 헬퍼/패턴 참고 | **dby 전용 commit**(멀티선택·그룹·헤드카운트, 아이템별 hold/대기 분기) |
| 내 차례 확인 | identify 인증(`findUsersByNameAndPin`) | **신규 화면 + 순번 쿼리** |
| 관제탑 | `/admin/waitings` 틀 | 점유 n/N·잔여 표시 + 폴링 |

## 10. 엣지 케이스 / 동시성

- **멀티선택 중 일부만 만석** → 그 아이템만 대기, 나머지 정상 hold/로그. 결과 화면에 혼합 안내.
- **동시성/초과배정**: 미고려(트랜잭션·락 미사용 — 사용자 결정, 저부하 키오스크). 드물게 동시 commit 시 N 초과 점유 가능하나 다음 만료/반납으로 자연 해소. 기존 `commitDbaseVisit`의 `db.transaction`도 제거하고 순차 실행.
- **동일 사용자 같은 아이템 중복 점유/대기** 방지.
- **만료 자동해제 트리거** → 키오스크가 유휴로 home/프로모션에 있으면 **60초 lazyCheck로 자동 처리**(smy와 동일, 사실상 무인 자동해제 됨). 그 외 트리거: page render(getAllItems)·키오스크 조회·변경 액션. **유일한 사각**: 아무 키오스크도 home/프로모션에 안 떠 있고 관제탑만 켜둔 경우 → 관제탑은 lazyCheck 없으니 staff 새로고침 전까지 지연. 필요하면 관제탑에 클라 주기 refresh(또는 lazyCheck 동일 패턴) 추가 옵션.
- **수량 미설정 시간제 아이템** → N=1 기본.

## 11. 영향 파일 (예상)

- `drizzle/schema.ts` — (재사용이라 변경 없음; 신규 컬럼 택 시에만)
- `src/lib/actions/dbase.ts` — dby commit에 hold/대기 분기 + revalidate 보강
- `src/lib/actions/rental.ts` — 가용성 N 확장, `getCurrentRenters`, 활성대여 아이템별 집계
- `src/lib/actions/waiting.ts` — 승급 조건 N 고려
- `src/components/dbase/DbaseKioskFlow.tsx` — 완료 화면 결과 분기 + **"내 차례 확인" 신규 step(`mystatus`)** + entry 진입 버튼
- `src/app/(admin)/admin/items/AddItemForm.tsx`, `EditItemForm.tsx`, `columns.tsx` — "사용자별 최대 대여 횟수" → "보유 수량(재고)" 라벨/노출 (현재 `SHOW_SMY_RENTAL_OPTIONS`로 숨긴 토글 정리와 함께 재정렬)
- `src/app/(admin)/admin/waitings/*` — 점유 n/N·잔여 표시 + 폴링

## 12. 미해결 / 추후

- ~~비시간제 수량 제한 필요?~~ → **해결: 시간제에만 적용**(반납 개념 없음).
- ~~관제탑 폴링 주기~~ → **해결: 폴링 없음(smy 패턴)**.
- ~~수량 컬럼 재사용 vs 신규~~ → **해결: `max_rentals_per_user` 재사용**(라벨만 변경, 마이그레이션 0).
- "예상 시간" 계산 방식(가장 이른 반납예정 기반) 정밀도 — 구현 시 결정.
