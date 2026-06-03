"use server";

import { db } from "@/lib/db";
import {
  rentalRecords,
  items,
  generalUsers,
  waitingQueue,
} from "@drizzle/schema";
import { eq, and, lte, sql, asc, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { triggerExpiredRentalsCheck } from "./rental"; // 경로 확인 필요

// ----------------------------------------------------------------------
// 대기열 등록 액션
// ----------------------------------------------------------------------

export async function addToWaitingList(
  userId: number,
  itemId: number,
  maleCount: number = 0,
  femaleCount: number = 0
) {
  await triggerExpiredRentalsCheck();

  try {
    const [item, user] = await Promise.all([
      db.query.items.findFirst({ where: eq(items.id, itemId) }),
      db.query.generalUsers.findFirst({ where: eq(generalUsers.id, userId) }),
    ]);

    if (!item || !user) throw new Error("정보를 찾을 수 없습니다.");
    if (!item.isTimeLimited)
      throw new Error("이 아이템은 대기열을 지원하지 않습니다.");

    let finalMaleCount = maleCount;
    let finalFemaleCount = femaleCount;
    if (item.isAutomaticGenderCount) {
      finalMaleCount = user.gender === "남" ? 1 : 0;
      finalFemaleCount = user.gender === "여" ? 1 : 0;
    }

    // ------------------------------------------------------------------
    // 기존 대기열 확인 로직
    // ------------------------------------------------------------------
    const existingWaiting = await db.query.waitingQueue.findFirst({
      where: and(
        eq(waitingQueue.userId, userId),
        eq(waitingQueue.itemId, itemId)
      ),
    });

    // 최종적으로 처리할 대기열 항목의 ID를 담을 변수
    let targetEntryId: number;

    if (existingWaiting) {
      // A. 현재 아이템의 대여 상태 확인
      const currentRental = await db.query.rentalRecords.findFirst({
        where: and(
          eq(rentalRecords.itemsId, itemId),
          eq(rentalRecords.isReturned, false)
        ),
      });

      const now = Math.floor(Date.now() / 1000);
      let shouldAllowOverwrite = false;

      // 조건 1: 좀비 상태 (자리 빔)
      if (!currentRental) {
        shouldAllowOverwrite = true;
      }
      // 조건 2: 연체 상태 (시간 지남)
      else if (
        currentRental.returnDueDate &&
        currentRental.returnDueDate < now
      ) {
        shouldAllowOverwrite = true;
      }

      if (shouldAllowOverwrite) {
        // [수정됨] 삭제하지 않고 업데이트! (순서 보장)
        // requestDate는 건드리지 않으므로 대기 순번이 유지됩니다.
        await db
          .update(waitingQueue)
          .set({
            maleCount: finalMaleCount,
            femaleCount: finalFemaleCount,
            // requestDate는 업데이트 하지 않음 -> 순서 유지
          })
          .where(eq(waitingQueue.id, existingWaiting.id));

        targetEntryId = existingWaiting.id; // 기존 ID 사용
      } else {
        throw new Error("이미 해당 아이템의 대기열에 등록되어 있습니다.");
      }
    } else {
      // 4. 신규 등록 (기존 로직)
      const [newEntry] = await db
        .insert(waitingQueue)
        .values({
          userId,
          itemId,
          requestDate: Math.floor(Date.now() / 1000),
          maleCount: finalMaleCount,
          femaleCount: finalFemaleCount,
        })
        .returning();

      targetEntryId = newEntry.id; // 새 ID 사용
    }

    // 5. [즉시 승급 로직]
    // 등록(또는 갱신) 직후 자리가 비었는지 확인
    const activeRental = await db.query.rentalRecords.findFirst({
      where: and(
        eq(rentalRecords.itemsId, itemId),
        eq(rentalRecords.isReturned, false)
      ),
    });

    if (!activeRental) {
      // targetEntryId를 사용하여 승급 처리
      const grantResult = await grantWaitingEntry(targetEntryId);
      if (grantResult.success) {
        return {
          success: true,
          message: "자리가 비어있어 즉시 대여되었습니다!",
          waitingPosition: 0,
          status: "rented",
        };
      }
    }

    // 6. 대기 순번 리턴
    // requestDate를 유지했으므로 내 순번도 그대로 유지됨
    const waitingCountResult = await db
      .select({ value: count() })
      .from(waitingQueue)
      .where(eq(waitingQueue.itemId, itemId));

    // 6. 대기 순번 리턴
    const myEntry = await db.query.waitingQueue.findFirst({
      where: eq(waitingQueue.id, targetEntryId),
    });

    const positionCount = await db
      .select({ value: count() })
      .from(waitingQueue)
      .where(
        and(
          eq(waitingQueue.itemId, itemId),
          lte(waitingQueue.requestDate, myEntry!.requestDate)
        )
      );

    const waitingPosition = positionCount[0].value;

    revalidatePath("/kiosk/smy");
    revalidatePath("/admin/waitings");

    return {
      success: true,
      message: "대기열에 성공적으로 등록되었습니다.",
      waitingPosition,
      status: "waiting",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "오류 발생",
    };
  }
}
export async function getWaitingQueueEntries(filters: {
  page?: number;
  per_page?: number;
}) {
  try {
    const { page = 1, per_page = 10 } = filters;
    const offset = (page - 1) * per_page;

    const whereConditions: any[] = [];

    const baseQuery = db
      .select({
        id: waitingQueue.id,
        itemId: waitingQueue.itemId,
        userId: waitingQueue.userId,
        requestDate: waitingQueue.requestDate,
        itemName: items.name,
        userName: generalUsers.name,
        rentalTimeMinutes: items.rentalTimeMinutes,
        quantity: items.quantity,
        maleCount: waitingQueue.maleCount,
        femaleCount: waitingQueue.femaleCount,
        visitSessionId: waitingQueue.visitSessionId,
      })
      .from(waitingQueue)
      .leftJoin(items, eq(waitingQueue.itemId, items.id))
      .leftJoin(generalUsers, eq(waitingQueue.userId, generalUsers.id));

    const filteredQuery =
      whereConditions.length > 0
        ? baseQuery.where(and(...whereConditions))
        : baseQuery;

    const dataQuery = filteredQuery
      .limit(per_page)
      .offset(offset)
      .orderBy(asc(waitingQueue.requestDate)); // 오래된 순으로 정렬

    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(waitingQueue)
      .leftJoin(items, eq(waitingQueue.itemId, items.id))
      .leftJoin(generalUsers, eq(waitingQueue.userId, generalUsers.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

    const [data, total] = await Promise.all([dataQuery, countQuery]);

    const total_count = total[0]?.count || 0;

    return { success: true, data, total_count };
  } catch (error) {
    console.error("Error fetching waiting queue entries:", error);
    return { error: "대기열 항목을 불러오는 데 실패했습니다." };
  }
}
export async function grantWaitingEntry(entryId: number) {
  await triggerExpiredRentalsCheck();
  try {
    // 1. 대기열 항목 조회
    const entry = await db.query.waitingQueue.findFirst({
      where: eq(waitingQueue.id, entryId),
    });

    if (!entry) {
      throw new Error("대기열 항목을 찾을 수 없습니다.");
    }

    // 2. 대여할 아이템 및 사용자 정보 조회
    const [itemToRent, userToRent] = await Promise.all([
      db.query.items.findFirst({ where: eq(items.id, entry.itemId) }),
      db.query.generalUsers.findFirst({
        where: eq(generalUsers.id, entry.userId),
      }),
    ]);

    if (!itemToRent || !userToRent) {
      throw new Error("아이템 또는 사용자 정보를 찾을 수 없습니다.");
    }

    // 3. [방어 로직] 보유 수량(N) 초과 여부 확인 (점유 단위 = 대여 1건 = 1)
    const quantity = itemToRent.quantity ?? 1;
    const [activeRow] = await db
      .select({ value: count() })
      .from(rentalRecords)
      .where(
        and(
          eq(rentalRecords.itemsId, entry.itemId),
          eq(rentalRecords.isReturned, false)
        )
      );

    if (itemToRent.isTimeLimited && (activeRow?.value ?? 0) >= quantity) {
      throw new Error(
        "해당 아이템은 잔여 수량이 없습니다. 반납 후 승급해주세요."
      );
    }

    // 4. (제거됨) 과거 quantity를 "하루 최대 횟수"로 해석하던 검증.
    //    D.Base에선 이 컬럼을 "보유 수량(N)"으로 재사용하므로 daily-cap 검증은 삭제.
    //    수량 초과는 위 3번(점유수 >= N) 방어로 처리한다.

    // 5. 대여 기록 생성
    const rentalDate = Math.floor(Date.now() / 1000);
    let returnDueDate: number | undefined = undefined;

    if (itemToRent.isTimeLimited && itemToRent.rentalTimeMinutes) {
      returnDueDate = rentalDate + itemToRent.rentalTimeMinutes * 60;
    }

    await db.insert(rentalRecords).values({
      userId: entry.userId,
      itemsId: entry.itemId,
      rentalDate: rentalDate,
      maleCount: entry.maleCount,
      femaleCount: entry.femaleCount,
      userName: userToRent.name,
      userPhone: userToRent.phoneNumber,
      itemName: itemToRent.name,
      itemCategory: itemToRent.category,
      returnDueDate: returnDueDate,
      isReturned: false,
    });

    // 6. 처리된 대기열 항목 삭제
    await db.delete(waitingQueue).where(eq(waitingQueue.id, entryId));

    revalidatePath("/admin/waitings");
    revalidatePath("/admin/records");
    revalidatePath("/admin/items");

    return {
      success: true,
      message: "대기열 항목이 성공적으로 승인되었습니다.",
    };
  } catch (error) {
    console.error("Error granting waiting entry:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "대기열 항목 승인 중 오류가 발생했습니다.",
    };
  }
}

export async function cancelWaitingEntry(entryId: number) {
  try {
    const entry = await db
      .select({ id: waitingQueue.id })
      .from(waitingQueue)
      .where(eq(waitingQueue.id, entryId))
      .get();

    if (!entry) {
      throw new Error("대기열 항목을 찾을 수 없습니다.");
    }

    await db.delete(waitingQueue).where(eq(waitingQueue.id, entryId));

    revalidatePath("/admin/waitings");

    return {
      success: true,
      message: "대기열 항목이 성공적으로 취소되었습니다.",
    };
  } catch (error) {
    console.error("Error cancelling waiting entry:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "대기열 항목 취소 중 오류가 발생했습니다.",
    };
  }
}

export async function getWaitingListByItemId(itemId: number) {
  try {
    const waitingList = await db
      .select({
        id: waitingQueue.id,
        userId: waitingQueue.userId,
        requestDate: waitingQueue.requestDate,
        userName: generalUsers.name,
        maleCount: waitingQueue.maleCount,
        femaleCount: waitingQueue.femaleCount,
      })
      .from(waitingQueue)
      .leftJoin(generalUsers, eq(waitingQueue.userId, generalUsers.id))
      .where(eq(waitingQueue.itemId, itemId))
      .orderBy(asc(waitingQueue.requestDate));

    return {
      success: true,
      data: waitingList.map((entry, index) => ({
        ...entry,
        position: index + 1,
      })),
    };
  } catch (error) {
    console.error("Error fetching waiting list by item id:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "대기자 명단을 불러오는 데 실패했습니다.",
    };
  }
}
