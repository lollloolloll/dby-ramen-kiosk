"use server";

import { db } from "@/lib/db";
import { assertValidHeadcount, type DbaseHeadcount } from "@/lib/dbase/headcount";
import {
  generalUsers,
  items,
  rentalRecords,
  visitSessions,
  waitingQueue,
} from "@drizzle/schema";
import { and, count, eq, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getActiveRentalCount,
  triggerExpiredRentalsCheck,
} from "@/lib/actions/rental";
import {
  decideRentalAction,
  estimateMaxWaitMinutes,
} from "@/lib/dbase/rental-decision";

const dbaseUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "이름을 입력해주세요.")
    .transform((value) => value.replace(/\s/g, "")),
  phoneNumber: z
    .string()
    .min(1, "휴대폰 번호를 입력해주세요.")
    .regex(/^010-\d{4}-\d{4}$/, "휴대폰 번호를 올바르게 입력해주세요."),
  gender: z.enum(["남", "여"], {
    message: "성별을 선택해주세요.",
  }),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{1,2}-\d{1,2}$/, "생년월일을 선택해주세요."),
  school: z.string().trim().min(1, "학교를 선택해주세요."),
  // 개인정보 동의는 선택(옵셔널). 미동의여도 등록 가능.
  personalInfoConsent: z.boolean().optional().default(false),
});

const dbaseVisitSchema = z.object({
  userId: z.number().int().positive(),
  itemIds: z.array(z.number().int().positive()).min(1, "컨텐츠를 선택해주세요."),
  headcount: z.object({
    totalCount: z.number().int(),
    youthMale: z.number().int(),
    youthFemale: z.number().int(),
    adultMale: z.number().int(),
    adultFemale: z.number().int(),
  }),
});

export type DbaseRegisteredUser = {
  id: number;
  name: string;
};

export type DbaseItemOutcome = {
  itemId: number;
  itemName: string;
  status: "started" | "queued" | "logged";
  queuePosition?: number; // status === "queued" 일 때 대기 순번
  maxWaitMinutes?: number; // status === "queued" 일 때 최대 예상 대기(분) 상한
};

export type DbaseVisitResult = {
  sessionId: number;
  outcomes: DbaseItemOutcome[];
};

export type UserDbaseStatus = {
  active: { id: number; itemName: string; returnDueDate: number | null }[];
  waiting: { itemName: string; position: number; maxWaitMinutes: number }[];
};

export async function registerDbaseUser(
  input: unknown
): Promise<{ success: true; user: DbaseRegisteredUser } | { error: string }> {
  const parsed = dbaseUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        parsed.error.flatten().fieldErrors.personalInfoConsent?.[0] ||
        parsed.error.flatten().fieldErrors.name?.[0] ||
        parsed.error.flatten().fieldErrors.phoneNumber?.[0] ||
        parsed.error.flatten().fieldErrors.gender?.[0] ||
        parsed.error.flatten().fieldErrors.birthDate?.[0] ||
        parsed.error.flatten().fieldErrors.school?.[0] ||
        "유효하지 않은 사용자 정보입니다.",
    };
  }

  const { name, phoneNumber, gender, birthDate, school, personalInfoConsent } =
    parsed.data;

  try {
    const existingUser = await db.query.generalUsers.findFirst({
      where: and(
        eq(generalUsers.name, name),
        eq(generalUsers.phoneNumber, phoneNumber)
      ),
    });

    if (existingUser) {
      return {
        success: true,
        user: { id: existingUser.id, name: existingUser.name },
      };
    }

    const [newUser] = await db
      .insert(generalUsers)
      .values({
        name,
        phoneNumber,
        gender,
        birthDate,
        school,
        personalInfoConsent,
      })
      .returning({ id: generalUsers.id, name: generalUsers.name });

    return { success: true, user: newUser };
  } catch (error) {
    console.error("D.BASE user registration failed:", error);
    return { error: "사용자 등록 중 오류가 발생했습니다." };
  }
}

export async function commitDbaseVisit(
  input: unknown
): Promise<{ success: true; data: DbaseVisitResult } | { error: string }> {
  const parsed = dbaseVisitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        parsed.error.flatten().fieldErrors.itemIds?.[0] ||
        "방문 등록 정보가 올바르지 않습니다.",
    };
  }

  const { userId, headcount } = parsed.data;
  const itemIds = Array.from(new Set(parsed.data.itemIds));

  try {
    assertValidHeadcount(headcount satisfies DbaseHeadcount);

    const user = await db.query.generalUsers.findFirst({
      where: eq(generalUsers.id, userId),
    });

    if (!user) {
      return { error: "사용자 정보를 찾을 수 없습니다." };
    }

    const selectedItems = await db
      .select()
      .from(items)
      .where(and(inArray(items.id, itemIds), eq(items.isDeleted, false)));

    if (selectedItems.length !== itemIds.length) {
      return { error: "선택한 컨텐츠 중 사용할 수 없는 항목이 있습니다." };
    }

    // 만료 먼저 정리(잔여 최신화) — smy 패턴. 트랜잭션·락 미사용(저부하 전제, 순차).
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
      // 중복 점유/대기 방지 (시간제만)
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
        outcomes.push({
          itemId: item.id,
          itemName: item.name,
          status: "started",
        });
      } else if (decision === "queue") {
        await db.insert(waitingQueue).values({
          itemId: item.id,
          userId,
          maleCount,
          femaleCount,
          // 승급 시 청소년/성인 분할을 보존하도록 그룹 방문 세션을 연결
          visitSessionId: newSession.id,
        });
        const [posRow] = await db
          .select({ value: count() })
          .from(waitingQueue)
          .where(eq(waitingQueue.itemId, item.id));
        const position = posRow?.value ?? 1;
        outcomes.push({
          itemId: item.id,
          itemName: item.name,
          status: "queued",
          queuePosition: position,
          maxWaitMinutes: estimateMaxWaitMinutes(
            position,
            item.quantity ?? 1,
            item.rentalTimeMinutes
          ),
        });
      } else {
        // 비시간제: 즉시 반납 방문 로그 (현행 동작 유지)
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
        outcomes.push({
          itemId: item.id,
          itemName: item.name,
          status: "logged",
        });
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
  } catch (error) {
    console.error("D.BASE visit commit failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "방문 등록 중 오류가 발생했습니다.",
    };
  }
}

/**
 * "내 차례 확인" — 사용자의 현재 점유(이용 중) 및 대기 현황 조회.
 * 조회 시 만료 자동처리(잔여 최신화)를 먼저 수행한다.
 */
export async function getUserDbaseStatus(
  userId: number
): Promise<{ success: true; data: UserDbaseStatus } | { error: string }> {
  try {
    await triggerExpiredRentalsCheck();

    // 시간제 아이템만 "이용 중"으로 노출 (비시간제는 즉시 로그라 점유 개념 없음).
    const active = await db
      .select({
        id: rentalRecords.id,
        itemName: rentalRecords.itemName,
        returnDueDate: rentalRecords.returnDueDate,
      })
      .from(rentalRecords)
      .innerJoin(items, eq(rentalRecords.itemsId, items.id))
      .where(
        and(
          eq(rentalRecords.userId, userId),
          eq(rentalRecords.isReturned, false),
          eq(items.isTimeLimited, true)
        )
      );

    const myWaits = await db
      .select()
      .from(waitingQueue)
      .where(eq(waitingQueue.userId, userId));

    const waiting = await Promise.all(
      myWaits.map(async (w) => {
        // 대기 순번 = 같은 아이템에서 나보다 먼저(또는 같이) 들어온 건수
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
          columns: { name: true, quantity: true, rentalTimeMinutes: true },
        });
        const position = ahead?.value ?? 1;
        return {
          itemName: item?.name ?? "",
          position,
          maxWaitMinutes: estimateMaxWaitMinutes(
            position,
            item?.quantity ?? 1,
            item?.rentalTimeMinutes ?? null
          ),
        };
      })
    );

    return {
      success: true,
      data: {
        active: active.map((a) => ({
          id: a.id,
          itemName: a.itemName ?? "",
          returnDueDate: a.returnDueDate,
        })),
        waiting,
      },
    };
  } catch (error) {
    console.error("getUserDbaseStatus failed:", error);
    return { error: "내 이용 현황을 불러오지 못했습니다." };
  }
}
