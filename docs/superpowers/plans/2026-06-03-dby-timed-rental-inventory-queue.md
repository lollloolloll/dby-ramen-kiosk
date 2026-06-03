# D.Base 시간제 대여 · 재고 · 대기열 · 관제탑 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dby 키오스크에 시간제 대여(보유 수량 N·시간만료 자동반납·대기열·내차례확인)와 관제탑을 추가한다. 점유 단위는 "대여 1건=1"(인원수 무관).

**Architecture:** smy 인프라(`rental_records.returnDueDate/isReturned`, `waiting_queue`, `processAndMutateExpiredRentals`/`triggerExpiredRentalsCheck`/`processNextInQueue`, 60초 lazyCheck, force-dynamic+revalidate)를 재사용한다. smy의 "1유닛" 가정을 "보유 수량 N(=`items.max_rentals_per_user` 재사용)"으로 확장하고, dby commit을 멀티선택→아이템별 (로그/hold/대기) 분기로 새로 쓴다. 트랜잭션·락 미사용(저부하 전제). 설계 출처: `docs/superpowers/specs/2026-06-03-dby-timed-rental-inventory-queue-design.md`.

**Tech Stack:** Next.js(App Router, server actions, force-dynamic), Drizzle ORM(SQLite), React, zod, react-hook-form, node:test(`.mjs`).

**프로젝트 제약 (필독):**
- **git 커밋은 사용자가 직접.** 각 Task의 commit 단계는 "사용자에게 커밋 요청"으로 처리(에이전트가 직접 커밋 금지). 스테이징까지만.
- **WSL에서 dev/build/test/npm 실행 금지.** `npm run build`/`dev`, Next 런타임 확인, 브라우저 검증은 **사용자가 Windows에서** 수행. 에이전트는 코드 작성만. 순수 로직(`.mjs`)만 `node --test`로 검증 가능(사용자 실행).

**핵심 규약 (전 Task 공통):**
- 보유 수량 `N = item.maxRentalsPerUser ?? 1` (시간제인데 미설정이면 1).
- 활성 점유수 = 해당 아이템의 `rentalRecords` 중 `isReturned=false` **건수**(인원수 무관, 1대여=1).
- 잔여 = `N − 활성 점유수`.

---

## 파일 구조 (생성/수정)

- **생성** `src/lib/dbase/rental-decision.ts` — 순수 분기 결정 함수(로그/hold/대기). 테스트 대상.
- **생성** `src/lib/dbase/rental-decision.test.mjs` — 위 단위 테스트.
- **수정** `src/lib/actions/rental.ts` — 점유수/가용성 N 헬퍼, `getCurrentRenters`, `getActiveRentalsWithWaitCount` 아이템별 집계.
- **수정** `src/lib/actions/dbase.ts` — `commitDbaseVisit` 재작성(아이템별 분기, 트랜잭션 제거, revalidate 보강) + 신규 `getUserDbaseStatus`.
- **수정** `src/lib/actions/waiting.ts` — 수동 승급(`approveWaitingEntry`)의 1유닛/daily-cap 가정 정리(N 기준).
- **수정** `src/components/dbase/DbaseKioskFlow.tsx` — 완료 화면 아이템별 결과, 신규 `mystatus` step + entry 진입 버튼.
- **수정** `src/app/(admin)/admin/items/AddItemForm.tsx`, `EditItemForm.tsx` — "사용자별 최대 대여 횟수" → "보유 수량(재고)" 라벨/설명.
- **수정** `src/app/(admin)/admin/items/columns.tsx` — (선택) "보유 수량" 컬럼 노출.
- **수정** `src/app/(admin)/admin/waitings/active-rentals-columns.tsx`, `WaitingPageClient.tsx` — 점유 n/N·잔여 표시.

---

## Phase 0 — 관리자 라벨: 보유 수량

### Task 0.1: AddItemForm 라벨/설명 변경

**Files:**
- Modify: `src/app/(admin)/admin/items/AddItemForm.tsx`

- [ ] **Step 1: 라벨/플레이스홀더 변경**

`name="maxRentalsPerUser"` 블록의 `<FormLabel>` 과 placeholder, zod 메시지를 수량 의미로 바꾼다.

`FormLabel` 텍스트: `사용자별 최대 대여 횟수` → `보유 수량(재고)`
`Input` placeholder: `ex) 3` → `ex) 2 (동시에 빌려줄 수 있는 개수)`
zod 메시지(파일 상단 `maxRentalsPerUser` 스키마): `"최대 대여 횟수는 양의 정수여야 합니다."` → `"보유 수량은 1 이상의 정수여야 합니다."`

- [ ] **Step 2: (사용자, Windows) 빌드/렌더 확인**

사용자가 `/admin/items`에서 아이템 추가 다이얼로그 → "시간제 대여" 켜면 "보유 수량(재고)" 입력이 보이는지 확인.

- [ ] **Step 3: 커밋(사용자 요청)**

```bash
git add "src/app/(admin)/admin/items/AddItemForm.tsx"
# 커밋은 사용자가: git commit -m "feat(admin): relabel maxRentalsPerUser to 보유 수량 in AddItemForm"
```

### Task 0.2: EditItemForm 동일 변경

**Files:**
- Modify: `src/app/(admin)/admin/items/EditItemForm.tsx`

- [ ] **Step 1:** `name="maxRentalsPerUser"` 블록 `<FormLabel>` `사용자별 최대 대여 횟수` → `보유 수량(재고)`, placeholder `ex) 3` → `ex) 2`, zod 메시지 동일 변경.
- [ ] **Step 2:** (사용자) 수정 다이얼로그에서 확인.
- [ ] **Step 3:** 스테이징 후 사용자 커밋 요청.

### Task 0.3: (선택) 아이템 테이블에 보유 수량 컬럼

**Files:**
- Modify: `src/app/(admin)/admin/items/columns.tsx`

- [ ] **Step 1:** `isTimeLimited`("대여 제한 여부") 컬럼 뒤에 보유 수량 컬럼 추가:

```tsx
  {
    accessorKey: "maxRentalsPerUser",
    header: "보유 수량",
    cell: ({ row }) => {
      const q = row.original.isTimeLimited
        ? (row.original.maxRentalsPerUser ?? 1)
        : null;
      return <span>{q === null ? "-" : q}</span>;
    },
  },
```

- [ ] **Step 2:** (사용자) 테이블 확인. **Step 3:** 사용자 커밋 요청.

---

## Phase 1 — 서버: 점유/가용성 N + 순수 분기 로직

### Task 1.1: 순수 분기 결정 함수 (TDD)

**Files:**
- Create: `src/lib/dbase/rental-decision.ts`
- Test: `src/lib/dbase/rental-decision.test.mjs`

- [ ] **Step 1: 실패 테스트 작성**

```js
// src/lib/dbase/rental-decision.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { itemQuantity, decideRentalAction } from "./rental-decision.ts";

test("itemQuantity: 시간제 미설정이면 1", () => {
  assert.equal(itemQuantity({ isTimeLimited: true, maxRentalsPerUser: null }), 1);
  assert.equal(itemQuantity({ isTimeLimited: true, maxRentalsPerUser: 3 }), 3);
});

test("비시간제는 'log'", () => {
  assert.equal(decideRentalAction({ isTimeLimited: false }, 0), "log");
});

test("시간제 잔여 있으면 'hold', 없으면 'queue'", () => {
  const item = { isTimeLimited: true, maxRentalsPerUser: 2 };
  assert.equal(decideRentalAction(item, 0), "hold");
  assert.equal(decideRentalAction(item, 1), "hold");
  assert.equal(decideRentalAction(item, 2), "queue");
  assert.equal(decideRentalAction(item, 3), "queue");
});
```

- [ ] **Step 2: (사용자, Windows) 실패 확인**

Run: `node --test src/lib/dbase/rental-decision.test.mjs`
Expected: FAIL (모듈 없음).
> 참고: `.ts` import가 node test에서 안 되면 `rental-decision.mjs`(순수 JS)로 작성하고 `.ts`는 re-export. 우선 순수 JS로 구현.

- [ ] **Step 3: 구현**

```ts
// src/lib/dbase/rental-decision.ts
export type RentalDecision = "log" | "hold" | "queue";

export function itemQuantity(item: {
  isTimeLimited: boolean | null;
  maxRentalsPerUser: number | null;
}): number {
  return item.maxRentalsPerUser ?? 1;
}

// activeCount = 해당 아이템의 미반납 대여 건수(1대여=1)
export function decideRentalAction(
  item: { isTimeLimited: boolean | null; maxRentalsPerUser?: number | null },
  activeCount: number
): RentalDecision {
  if (!item.isTimeLimited) return "log";
  const n = item.maxRentalsPerUser ?? 1;
  return activeCount < n ? "hold" : "queue";
}
```

- [ ] **Step 4: (사용자) 통과 확인** — `node --test ...` → PASS.
- [ ] **Step 5:** 스테이징 후 사용자 커밋 요청 (`feat(dbase): pure rental decision helper`).

### Task 1.2: 활성 점유수 + 가용성 헬퍼

**Files:**
- Modify: `src/lib/actions/rental.ts`

- [ ] **Step 1: `getActiveRentalCount` 추가** (파일 끝, export)

```ts
import { count } from "drizzle-orm"; // 이미 import되어 있으면 생략

/** 해당 아이템의 미반납 대여 건수(1대여=1, 인원수 무관) */
export async function getActiveRentalCount(itemId: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(rentalRecords)
    .where(
      and(
        eq(rentalRecords.itemsId, itemId),
        eq(rentalRecords.isReturned, false)
      )
    );
  return row?.value ?? 0;
}
```

- [ ] **Step 2: `getCurrentRenters` 추가**(기존 `getCurrentRenter` limit(1)을 대체하지 말고 신규 추가 — 기존 호출부 영향 방지)

```ts
/** 현재 점유 중인 대여 목록(여러 건). 관제탑/상태 표시용 */
export async function getCurrentRenters(itemId: number) {
  return db
    .select({
      id: rentalRecords.id,
      userName: sql<string>`COALESCE(${generalUsers.name}, ${rentalRecords.userName})`,
      rentalDate: rentalRecords.rentalDate,
      returnDueDate: rentalRecords.returnDueDate,
      maleCount: rentalRecords.maleCount,
      femaleCount: rentalRecords.femaleCount,
    })
    .from(rentalRecords)
    .leftJoin(generalUsers, eq(rentalRecords.userId, generalUsers.id))
    .where(
      and(
        eq(rentalRecords.itemsId, itemId),
        eq(rentalRecords.isReturned, false)
      )
    );
}
```

- [ ] **Step 3: (사용자) `npm run build` 타입 확인** (Windows). Expected: 컴파일 통과.
- [ ] **Step 4:** 스테이징 후 사용자 커밋 요청.

### Task 1.3: 관제탑용 아이템별 집계 조회

**Files:**
- Modify: `src/lib/actions/rental.ts` (`getActiveRentalsWithWaitCount` 보강 또는 신규 `getItemOccupancyBoard`)

- [ ] **Step 1: 신규 `getItemOccupancyBoard` 추가** (기존 함수 깨지 않도록 신규)

```ts
/** 관제탑: 시간제 아이템별 점유 n/N, 잔여, 대기수, 다음 반납예정 */
export async function getItemOccupancyBoard() {
  const timeLimited = await db
    .select()
    .from(items)
    .where(and(eq(items.isTimeLimited, true), eq(items.isDeleted, false)));

  const board = await Promise.all(
    timeLimited.map(async (item) => {
      const renters = await getCurrentRenters(item.id);
      const [waitRow] = await db
        .select({ value: count() })
        .from(waitingQueue)
        .where(eq(waitingQueue.itemId, item.id));
      const n = item.maxRentalsPerUser ?? 1;
      const occupied = renters.length;
      const nextDue = renters
        .map((r) => r.returnDueDate)
        .filter((d): d is number => typeof d === "number")
        .sort((a, b) => a - b)[0];
      return {
        itemId: item.id,
        itemName: item.name,
        quantity: n,
        occupied,
        remaining: Math.max(0, n - occupied),
        waitCount: waitRow?.value ?? 0,
        nextDueDate: nextDue ?? null,
        renters,
      };
    })
  );
  return { success: true as const, data: board };
}
```

- [ ] **Step 2: (사용자) build 타입 확인.** **Step 3:** 사용자 커밋 요청.

---

## Phase 2 — 서버: dby commit 분기 + 사용자 상태 조회

### Task 2.1: `commitDbaseVisit` 재작성 (아이템별 로그/hold/대기)

**Files:**
- Modify: `src/lib/actions/dbase.ts`

- [ ] **Step 1: import 추가**

```ts
import { waitingQueue } from "@drizzle/schema";
import { count } from "drizzle-orm";
import {
  getActiveRentalCount,
  triggerExpiredRentalsCheck,
} from "@/lib/actions/rental";
import { decideRentalAction } from "@/lib/dbase/rental-decision";
```

- [ ] **Step 2: 반환 타입 확장**

```ts
export type DbaseItemOutcome = {
  itemId: number;
  itemName: string;
  status: "started" | "queued" | "logged";
  queuePosition?: number; // queued일 때
};
export type DbaseVisitResult = {
  sessionId: number;
  outcomes: DbaseItemOutcome[];
};
```

- [ ] **Step 3: commit 본문 교체** (`commitDbaseVisit`의 `try` 내부 — 기존 `db.transaction(...)` 블록 전체를 아래 순차 로직으로 교체. **트랜잭션 미사용**)

```ts
    // 만료 먼저 정리(잔여 최신화) — smy 패턴
    await triggerExpiredRentalsCheck();

    const rentalDate = Math.floor(Date.now() / 1000);
    const maleCount = headcount.youthMale + headcount.adultMale;
    const femaleCount = headcount.youthFemale + headcount.adultFemale;

    // 방문 세션(헤드카운트) 기록 — 기존 유지
    const [newSession] = await db
      .insert(visitSessions)
      .values({
        generalUserId: userId,
        totalCount: headcount.totalCount,
        youthMale: headcount.youthMale,
        youthFemale: headcount.youthFemale,
        adultMale: headcount.adultMale,
        adultFemale: headcount.adultFemale,
      })
      .returning({ id: visitSessions.id });

    const outcomes: DbaseItemOutcome[] = [];

    for (const item of selectedItems) {
      const activeCount = item.isTimeLimited
        ? await getActiveRentalCount(item.id)
        : 0;
      const decision = decideRentalAction(item, activeCount);

      if (decision === "hold") {
        const returnDueDate = item.rentalTimeMinutes
          ? rentalDate + item.rentalTimeMinutes * 60
          : null;
        await db.insert(rentalRecords).values({
          userId,
          visitSessionId: newSession.id,
          itemsId: item.id,
          maleCount,
          femaleCount,
          userName: user.name,
          userPhone: user.phoneNumber,
          userSchool: user.school,
          userGender: user.gender,
          userBirthDate: user.birthDate,
          itemName: item.name,
          itemCategory: item.category,
          rentalDate,
          returnDueDate,
          isReturned: false,
          isManualReturn: false,
        });
        outcomes.push({ itemId: item.id, itemName: item.name, status: "started" });
      } else if (decision === "queue") {
        await db.insert(waitingQueue).values({
          itemId: item.id,
          userId,
          maleCount,
          femaleCount,
        });
        const [posRow] = await db
          .select({ value: count() })
          .from(waitingQueue)
          .where(eq(waitingQueue.itemId, item.id));
        outcomes.push({
          itemId: item.id,
          itemName: item.name,
          status: "queued",
          queuePosition: posRow?.value ?? undefined,
        });
      } else {
        // 비시간제: 현행처럼 즉시 반납된 방문 로그
        await db.insert(rentalRecords).values({
          userId,
          visitSessionId: newSession.id,
          itemsId: item.id,
          maleCount,
          femaleCount,
          userName: user.name,
          userPhone: user.phoneNumber,
          userSchool: user.school,
          userGender: user.gender,
          userBirthDate: user.birthDate,
          itemName: item.name,
          itemCategory: item.category,
          rentalDate,
          isReturned: true,
          returnDate: rentalDate,
          isManualReturn: false,
        });
        outcomes.push({ itemId: item.id, itemName: item.name, status: "logged" });
      }
    }

    revalidatePath("/", "layout");
    revalidatePath("/kiosk/dby");
    revalidatePath("/admin/waitings");
    revalidatePath("/admin/records");

    return {
      success: true,
      data: { sessionId: newSession.id, outcomes },
    };
```

> 주의: 기존 반환의 `contents` 필드는 제거(위 `DbaseVisitResult`에서 삭제됨). `result.data.contents`를 쓰는 `DbaseKioskFlow`는 Task 3.1에서 `outcomes`로 함께 교체하므로 컴파일 깨짐 없음(같은 PR 내 처리).

- [ ] **Step 4: 중복 점유/대기 방지** — `for` 루프 진입부에서, 이미 같은 사용자가 같은 아이템을 점유/대기 중이면 skip:

```ts
      if (item.isTimeLimited) {
        const dup = await db.query.rentalRecords.findFirst({
          where: and(
            eq(rentalRecords.userId, userId),
            eq(rentalRecords.itemsId, item.id),
            eq(rentalRecords.isReturned, false)
          ),
        });
        const dupWait = await db.query.waitingQueue.findFirst({
          where: and(
            eq(waitingQueue.userId, userId),
            eq(waitingQueue.itemId, item.id)
          ),
        });
        if (dup || dupWait) {
          outcomes.push({
            itemId: item.id,
            itemName: item.name,
            status: dup ? "started" : "queued",
          });
          continue;
        }
      }
```

- [ ] **Step 5: (사용자, Windows) build + 키오스크 수동 테스트** — 시간제 아이템 N=1 등록 후, 한 명 대여→"이용 시작", 두 번째→"대기 1번".
- [ ] **Step 6:** 스테이징 후 사용자 커밋 요청.

### Task 2.2: `getUserDbaseStatus` (내 차례 확인용 조회)

**Files:**
- Modify: `src/lib/actions/dbase.ts`

- [ ] **Step 1: 조회 함수 추가**

```ts
export type UserDbaseStatus = {
  active: { itemName: string; returnDueDate: number | null }[];
  waiting: { itemName: string; position: number }[];
};

export async function getUserDbaseStatus(
  userId: number
): Promise<{ success: true; data: UserDbaseStatus } | { error: string }> {
  try {
    await triggerExpiredRentalsCheck(); // 조회 시 최신화

    const active = await db
      .select({
        itemName: rentalRecords.itemName,
        returnDueDate: rentalRecords.returnDueDate,
      })
      .from(rentalRecords)
      .where(
        and(
          eq(rentalRecords.userId, userId),
          eq(rentalRecords.isReturned, false)
        )
      );

    const myWaits = await db
      .select()
      .from(waitingQueue)
      .where(eq(waitingQueue.userId, userId));

    const waiting = await Promise.all(
      myWaits.map(async (w) => {
        // position = 같은 아이템에서 나보다 먼저(requestDate <=) 들어온 건수
        const [ahead] = await db
          .select({ value: count() })
          .from(waitingQueue)
          .where(
            and(
              eq(waitingQueue.itemId, w.itemId),
              lte(waitingQueue.requestDate, w.requestDate)
            )
          );
        const item = await db.query.items.findFirst({
          where: eq(items.id, w.itemId),
          columns: { name: true },
        });
        return { itemName: item?.name ?? "", position: ahead?.value ?? 1 };
      })
    );

    return { success: true, data: { active, waiting } };
  } catch (error) {
    console.error("getUserDbaseStatus failed:", error);
    return { error: "내 이용 현황을 불러오지 못했습니다." };
  }
}
```

추가 import 필요: `import { lte } from "drizzle-orm";`

- [ ] **Step 2: (사용자) build 타입 확인.** **Step 3:** 사용자 커밋 요청.

---

## Phase 3 — 키오스크: 결과 화면 + 내 차례 확인

### Task 3.1: 완료(done) 화면 아이템별 결과

**Files:**
- Modify: `src/components/dbase/DbaseKioskFlow.tsx`

- [ ] **Step 1: 상태 타입 교체** — `doneContents: string[]` → `outcomes` 사용. `handleCommit`에서 `result.data.outcomes`를 새 상태 `setOutcomes`에 저장(`DbaseItemOutcome[]`). `commitDbaseVisit` 반환에서 `contents` 참조 제거.
- [ ] **Step 2: done 섹션 렌더 변경** — 기존 `doneContents.map(...)` 블록을 결과 칩으로:

```tsx
{outcomes.length > 0 && (
  <div className="flex max-w-2xl flex-wrap justify-center gap-2">
    {outcomes.map((o) => (
      <span
        key={o.itemId}
        className="rounded-full px-4 py-2 text-sm font-semibold"
        style={{
          backgroundColor:
            o.status === "queued" ? "var(--brand-accent)" : "var(--brand-primary)",
          color: "var(--brand-on-primary)",
        }}
      >
        {o.itemName}{" "}
        {o.status === "started"
          ? "· 이용 시작"
          : o.status === "queued"
          ? `· 대기 ${o.queuePosition ?? ""}번`
          : ""}
      </span>
    ))}
  </div>
)}
```

- [ ] **Step 3: (사용자) 키오스크에서 혼합 결과 확인** (이용 시작/대기 혼합).
- [ ] **Step 4:** 스테이징 후 사용자 커밋 요청.

### Task 3.2: "내 차례 확인" step + 진입 버튼

**Files:**
- Modify: `src/components/dbase/DbaseKioskFlow.tsx`

- [ ] **Step 1: Step 타입에 `mystatus` 추가** — `type Step = ... | "mystatus";`
- [ ] **Step 2: entry 화면에 진입 버튼 추가** — 기존 두 `EntryButton`(처음/재방문) 아래에 작은 텍스트 버튼:

```tsx
<button
  type="button"
  onClick={() => { resetFlow(); setStep("mystatus"); }}
  className="mx-auto mt-2 text-sm font-medium text-(--body-muted) underline underline-offset-4"
>
  내 차례 확인
</button>
```

- [ ] **Step 3: `mystatus` 렌더** — identify와 동일한 이름+전화4자리 입력 후 `findUsersByNameAndPin` → `getUserDbaseStatus(user.id)` 결과 표시. 상태: `const [statusData, setStatusData] = useState<UserDbaseStatus | null>(null);`

```tsx
{step === "mystatus" && (
  <Panel
    eyebrow=""
    title="내 차례 확인"
    footer={
      <FlowFooter
        backLabel={copy.buttonRestart}
        nextLabel={copy.buttonOk}
        onBack={() => setStep("entry")}
        onNext={async () => {
          setError("");
          const pin = identifyPin.replace(/[^\d]/g, "");
          if (!identifyName.trim() || pin.length !== 4) {
            setError("이름과 전화번호 가운데 4자리를 입력해주세요.");
            return;
          }
          setIsSubmitting(true);
          try {
            const res = await findUsersByNameAndPin(identifyName, pin);
            if (res.status !== "single_match") { setStep("mismatch"); return; }
            const s = await getUserDbaseStatus(res.user.id);
            if ("error" in s) { setError(s.error); return; }
            setStatusData(s.data);
          } finally { setIsSubmitting(false); }
        }}
        disabled={isSubmitting}
      />
    }
  >
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={copy.fieldName}>
          <Input value={identifyName} lang="ko" autoComplete="off"
            onChange={(e) => setIdentifyName(e.target.value)} className="h-14 text-lg" />
        </Field>
        <Field label={copy.fieldPin}>
          <Input type="tel" inputMode="numeric" maxLength={4} value={identifyPin}
            onChange={(e) => setIdentifyPin(e.target.value.replace(/[^\d]/g, ""))}
            className="h-14 text-lg tracking-[0.5em]" />
        </Field>
      </div>
      {statusData && (
        <div className="grid gap-2">
          {statusData.active.map((a, i) => (
            <p key={`a${i}`} className="text-lg">
              <span className="font-semibold">{a.itemName}</span> · 이용 중
            </p>
          ))}
          {statusData.waiting.map((w, i) => (
            <p key={`w${i}`} className="text-lg">
              <span className="font-semibold">{w.itemName}</span> · 대기 {w.position}번
            </p>
          ))}
          {statusData.active.length === 0 && statusData.waiting.length === 0 && (
            <p className="text-(--body-muted)">현재 이용/대기 중인 항목이 없습니다.</p>
          )}
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  </Panel>
)}
```

- [ ] **Step 4: import 추가** — `getUserDbaseStatus`, `type UserDbaseStatus` from `@/lib/actions/dbase`.
- [ ] **Step 5: (사용자) 키오스크에서 내차례확인 동작 확인.**
- [ ] **Step 6:** 스테이징 후 사용자 커밋 요청.

---

## Phase 4 — 관제탑 (점유 n/N · 잔여)

### Task 4.1: 관제탑에 점유/잔여 표시

**Files:**
- Modify: `src/app/(admin)/admin/waitings/page.tsx`
- Modify: `src/app/(admin)/admin/waitings/WaitingPageClient.tsx`
- Create/Modify: `src/app/(admin)/admin/waitings/occupancy-columns.tsx`

- [ ] **Step 1: page.tsx에서 보드 조회 추가** — `import { getItemOccupancyBoard } from "@/lib/actions/rental";` 후 `Promise.all`에 추가, `WaitingPageClient`에 `occupancy={board.data}` 전달.
- [ ] **Step 2: occupancy 테이블 컬럼 생성** (`occupancy-columns.tsx`):

```tsx
"use client";
import { ColumnDef } from "@tanstack/react-table";

export type OccupancyRow = {
  itemId: number; itemName: string; quantity: number;
  occupied: number; remaining: number; waitCount: number;
  nextDueDate: number | null;
};

export const occupancyColumns: ColumnDef<OccupancyRow>[] = [
  { accessorKey: "itemName", header: "아이템" },
  { id: "occ", header: "점유", cell: ({ row }) =>
      `${row.original.occupied}/${row.original.quantity}` },
  { accessorKey: "remaining", header: "잔여" },
  { accessorKey: "waitCount", header: "대기" },
  { id: "due", header: "다음 반납예정", cell: ({ row }) =>
      row.original.nextDueDate
        ? new Date(row.original.nextDueDate * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
        : "-" },
];
```

- [ ] **Step 3: WaitingPageClient에 보드 테이블 렌더** — 기존 활성대여/대기열 위에 `<DataTable columns={occupancyColumns} data={occupancy} />` + 제목 "아이템 관제탑". props 타입에 `occupancy: OccupancyRow[]` 추가.
- [ ] **Step 4: (사용자) `/admin/waitings`에서 점유/잔여/대기 표시 확인.**
- [ ] **Step 5:** 스테이징 후 사용자 커밋 요청.

### Task 4.2: 수동 승급의 N/일일한도 가정 정리

**Files:**
- Modify: `src/lib/actions/waiting.ts` (`approveWaitingEntry`)

- [ ] **Step 1: 1유닛 방어 → N 기준으로 교체** — line 252-263의 "이미 사용 중이면 차단" `findFirst`를 점유수<N 체크로:

```ts
    const { getActiveRentalCount } = await import("./rental");
    const activeCount = await getActiveRentalCount(entry.itemId);
    const n = itemToRent.maxRentalsPerUser ?? 1;
    if (itemToRent.isTimeLimited && activeCount >= n) {
      throw new Error("해당 아이템은 잔여 수량이 없습니다. 반납 후 승급해주세요.");
    }
```

- [ ] **Step 2: daily-cap 체크 제거(또는 비활성)** — line 266-294의 `maxRentalsPerUser`를 "하루 최대 횟수"로 해석하는 블록은 **수량 의미와 충돌**하므로 dby에선 제거. 해당 블록 전체 삭제.
- [ ] **Step 3: (사용자) 관제탑에서 수동 승급 동작 확인.**
- [ ] **Step 4:** 스테이징 후 사용자 커밋 요청.

---

## 최종 검증 (사용자, Windows)

- [ ] `npm run build` 통과.
- [ ] 시간제 아이템 N=2 등록 → 3팀 대여 시 2팀 "이용 시작", 3팀째 "대기 1번".
- [ ] 시간 만료 후(또는 유휴 60초 lazyCheck) 자동 반납 + 대기자 승급, 관제탑/내차례확인 반영.
- [ ] 비시간제 아이템은 기존처럼 즉시 로그.
- [ ] `/admin/records`에 대여/방문 기록 정상.

---

## 미해결 / 후속

- 큐→승급 건은 `visitSession`/청소년·성인 분할 미기록(남/여 수만) — 분석 영향 점검.
- 관제탑 라이브 카운트다운(클라 ticker) 필요 시 추가.
- "예상 시간" 표시(가장 이른 `nextDueDate` 기반) 정밀화.
