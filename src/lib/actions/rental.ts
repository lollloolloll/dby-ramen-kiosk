"use server";

import { db } from "@/lib/db";
import {
  rentalRecords,
  items,
  generalUsers,
  waitingQueue,
  rentalRecordPeople,
  visitSessions,
} from "@drizzle/schema";
import {
  eq,
  and,
  gte,
  lte,
  sql,
  asc,
  desc,
  like,
  count,
  or,
  inArray,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Workbook } from "exceljs";
import { AnalyticsData } from "@/lib/types/analytics";

// ----------------------------------------------------------------------
// 유틸리티 함수
// ----------------------------------------------------------------------

function calculateAge(
  birthDate: string | null,
  referenceDate: Date = new Date()
): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const targetDate = referenceDate;

  let age = targetDate.getFullYear() - birth.getFullYear();
  const m = targetDate.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && targetDate.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
function getAgeGroup(age: number | null): string {
  if (age === null) return "알 수 없음";
  if (age <= 8) return "아동";
  if (age <= 24) return "청소년"; // 9세 ~ 24세
  return "성인"; // 25세 이상
}

// ----------------------------------------------------------------------
// 서버 액션: 대여 관련
// ----------------------------------------------------------------------
// lib/actions/rental.ts

export async function rentItem(
  userId: number,
  itemId: number,
  maleCount: number,
  femaleCount: number,
  participants?: Array<{ name: string; gender: "남" | "여" }>
) {
  await triggerExpiredRentalsCheck();
  try {
    const itemToRent = await db
      .select()
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.isDeleted, false)))
      .get();
    const userToRent = await db
      .select()
      .from(generalUsers)
      .where(eq(generalUsers.id, userId))
      .get();

    if (!itemToRent || !userToRent) throw new Error("정보를 찾을 수 없습니다.");

    // --- 성별 카운트 및 참여자 자동 할당 로직 ---
    let finalMaleCount = maleCount;
    let finalFemaleCount = femaleCount;
    let finalParticipants = participants || [];

    // 자동 카운트가 활성화(true) 되어있다면
    if (itemToRent.isAutomaticGenderCount) {
      finalMaleCount = userToRent.gender === "남" ? 1 : 0;
      finalFemaleCount = userToRent.gender === "여" ? 1 : 0;

      // 참여자 추적도 켜져있다면 본인을 참여자 명단에 자동 추가
      if (itemToRent.enableParticipantTracking) {
        finalParticipants = [
          { name: userToRent.name, gender: userToRent.gender as "남" | "여" },
        ];
      }
    }
    // ------------------------------------------

    // 3. 시간제 아이템 검증 로직
    if (itemToRent.isTimeLimited) {
      // 3-1. 재고 확인: 현재 대여 중인 기록이 있는지 확인
      const currentRental = await db
        .select({ id: rentalRecords.id })
        .from(rentalRecords)
        .where(
          and(
            eq(rentalRecords.itemsId, itemId),
            eq(rentalRecords.isReturned, false)
          )
        )
        .limit(1)
        .get();

      if (currentRental) {
        throw new Error("이미 다른 사람이 대여 중인 아이템입니다.");
      }

      // 3-2. 사용자별 최대 대여 횟수 제한 확인 (하루 기준)
      if (itemToRent.maxRentalsPerUser) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfDay = Math.floor(today.getTime() / 1000);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        const endOfDayTimestamp = Math.floor(endOfDay.getTime() / 1000);

        const [userDailyRentals] = await db
          .select({ count: sql<number>`count(*)` })
          .from(rentalRecords)
          .where(
            and(
              eq(rentalRecords.userId, userId),
              eq(rentalRecords.itemsId, itemId),
              gte(rentalRecords.rentalDate, startOfDay),
              lte(rentalRecords.rentalDate, endOfDayTimestamp)
            )
          );

        if ((userDailyRentals?.count || 0) >= itemToRent.maxRentalsPerUser) {
          throw new Error("오늘 해당 아이템의 최대 대여 횟수를 초과했습니다.");
        }
      }
    }

    const rentalDate = Math.floor(Date.now() / 1000);
    let returnDueDate: number | undefined = undefined;
    if (itemToRent.isTimeLimited && itemToRent.rentalTimeMinutes) {
      returnDueDate = rentalDate + itemToRent.rentalTimeMinutes * 60;
    }

    const [newRental] = await db
      .insert(rentalRecords)
      .values({
        userId,
        itemsId: itemId,
        maleCount: finalMaleCount,
        femaleCount: finalFemaleCount,
        userName: userToRent.name,
        userPhone: userToRent.phoneNumber,
        userSchool: userToRent.school,
        userGender: userToRent.gender,
        userBirthDate: userToRent.birthDate,
        itemName: itemToRent.name,
        itemCategory: itemToRent.category,
        rentalDate,
        returnDueDate,
        isReturned: false,
      })
      .returning({ id: rentalRecords.id });

    // 참여자 정보 저장 (사용자 입력 또는 자동 생성된 본인 데이터)
    if (
      itemToRent.enableParticipantTracking &&
      finalParticipants.length > 0 &&
      newRental?.id
    ) {
      const validParticipants = finalParticipants.filter(
        (p) => p.name.trim() !== ""
      );

      if (validParticipants.length > 0) {
        await db.insert(rentalRecordPeople).values(
          validParticipants.map((participant) => ({
            rentalRecordId: newRental.id,
            name: participant.name.trim(),
            gender: participant.gender,
          }))
        );
      }
    }

    revalidatePath("/");
    revalidatePath("/admin/items");
    revalidatePath("/admin/records");

    return { success: true, message: "아이템 대여가 완료되었습니다." };
  } catch (error) {
    console.error("Rental Failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "대여 처리 중 예상치 못한 오류가 발생했습니다.",
    };
  }
}
export type CartRentalResult = {
  itemId: number;
  itemName: string;
  status: "rented" | "skipped";
  reason?: string;
};

export async function rentMultipleItems(
  userId: number,
  itemIds: number[],
  maleCount: number,
  femaleCount: number,
  participants?: Array<{ name: string; gender: "남" | "여" }>
): Promise<{ success: boolean; results: CartRentalResult[]; error?: string }> {
  await triggerExpiredRentalsCheck();
  try {
    const userToRent = await db
      .select()
      .from(generalUsers)
      .where(eq(generalUsers.id, userId))
      .get();

    if (!userToRent) {
      return {
        success: false,
        results: [],
        error: "사용자 정보를 찾을 수 없습니다.",
      };
    }

    const results: CartRentalResult[] = [];

    for (const itemId of itemIds) {
      const itemToRent = await db
        .select()
        .from(items)
        .where(and(eq(items.id, itemId), eq(items.isDeleted, false)))
        .get();

      if (!itemToRent) {
        results.push({
          itemId,
          itemName: "삭제된 물품",
          status: "skipped",
          reason: "물품 정보를 찾을 수 없습니다.",
        });
        continue;
      }

      // 성별 카운트 및 참여자 자동 할당 (아이템 설정 우선)
      let finalMaleCount = maleCount;
      let finalFemaleCount = femaleCount;
      let finalParticipants = participants || [];

      if (itemToRent.isAutomaticGenderCount) {
        finalMaleCount = userToRent.gender === "남" ? 1 : 0;
        finalFemaleCount = userToRent.gender === "여" ? 1 : 0;
        if (itemToRent.enableParticipantTracking) {
          finalParticipants = [
            { name: userToRent.name, gender: userToRent.gender as "남" | "여" },
          ];
        }
      }

      // 시간제 아이템 검증 (재고/일일 한도) — 실패 시 throw 대신 skip
      if (itemToRent.isTimeLimited) {
        const currentRental = await db
          .select({ id: rentalRecords.id })
          .from(rentalRecords)
          .where(
            and(
              eq(rentalRecords.itemsId, itemId),
              eq(rentalRecords.isReturned, false)
            )
          )
          .limit(1)
          .get();

        if (currentRental) {
          results.push({
            itemId,
            itemName: itemToRent.name,
            status: "skipped",
            reason: "이미 다른 사람이 대여 중입니다.",
          });
          continue;
        }

        if (itemToRent.maxRentalsPerUser) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const startOfDay = Math.floor(today.getTime() / 1000);
          const endOfDay = new Date(today);
          endOfDay.setHours(23, 59, 59, 999);
          const endOfDayTimestamp = Math.floor(endOfDay.getTime() / 1000);

          const [userDailyRentals] = await db
            .select({ count: sql<number>`count(*)` })
            .from(rentalRecords)
            .where(
              and(
                eq(rentalRecords.userId, userId),
                eq(rentalRecords.itemsId, itemId),
                gte(rentalRecords.rentalDate, startOfDay),
                lte(rentalRecords.rentalDate, endOfDayTimestamp)
              )
            );

          if ((userDailyRentals?.count || 0) >= itemToRent.maxRentalsPerUser) {
            results.push({
              itemId,
              itemName: itemToRent.name,
              status: "skipped",
              reason: "오늘 최대 대여 횟수를 초과했습니다.",
            });
            continue;
          }
        }
      }

      const rentalDate = Math.floor(Date.now() / 1000);
      let returnDueDate: number | undefined = undefined;
      if (itemToRent.isTimeLimited && itemToRent.rentalTimeMinutes) {
        returnDueDate = rentalDate + itemToRent.rentalTimeMinutes * 60;
      }

      const [newRental] = await db
        .insert(rentalRecords)
        .values({
          userId,
          itemsId: itemId,
          maleCount: finalMaleCount,
          femaleCount: finalFemaleCount,
          userName: userToRent.name,
          userPhone: userToRent.phoneNumber,
          userSchool: userToRent.school,
          userGender: userToRent.gender,
          userBirthDate: userToRent.birthDate,
          itemName: itemToRent.name,
          itemCategory: itemToRent.category,
          rentalDate,
          returnDueDate,
          isReturned: false,
        })
        .returning({ id: rentalRecords.id });

      if (
        itemToRent.enableParticipantTracking &&
        finalParticipants.length > 0 &&
        newRental?.id
      ) {
        const validParticipants = finalParticipants.filter(
          (p) => p.name.trim() !== ""
        );

        if (validParticipants.length > 0) {
          await db.insert(rentalRecordPeople).values(
            validParticipants.map((participant) => ({
              rentalRecordId: newRental.id,
              name: participant.name.trim(),
              gender: participant.gender,
            }))
          );
        }
      }

      results.push({
        itemId,
        itemName: itemToRent.name,
        status: "rented",
      });
    }

    revalidatePath("/");
    revalidatePath("/admin/items");
    revalidatePath("/admin/records");

    return { success: true, results };
  } catch (error) {
    console.error("Cart Rental Failed:", error);
    return {
      success: false,
      results: [],
      error:
        error instanceof Error
          ? error.message
          : "대여 처리 중 예상치 못한 오류가 발생했습니다.",
    };
  }
}

export async function returnItem(rentalRecordId: number) {
  await processAndMutateExpiredRentals();
  try {
    const [returnedRecord] = await db
      .update(rentalRecords)
      .set({
        isReturned: true,
        returnDate: Math.floor(Date.now() / 1000),
        isManualReturn: true,
      })
      .where(eq(rentalRecords.id, rentalRecordId))
      .returning();

    if (!returnedRecord || !returnedRecord.itemsId) {
      throw new Error("유효하지 않은 반납 기록이거나 아이템 정보가 없습니다.");
    }

    // 다음 대기자 처리
    await processNextInQueue(returnedRecord.itemsId);

    revalidatePath("/", "layout"); // 전체 경로 리프레시
    return {
      success: true,
      message: "아이템 반납 및 다음 대기자 처리가 완료되었습니다.",
    };
  } catch (error) {
    console.error("ReturnFailed", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "반납 중 예상치 못한 오류가 발생했습니다.",
    };
  }
}

// ----------------------------------------------------------------------
// 내부 로직: 대기열 처리 및 만료 체크
// ----------------------------------------------------------------------

/**
 * [내부 사용 주의] DB의 만료된 대여 기록을 처리하지만, 캐시는 갱신하지 않습니다.
 * 렌더링 중에 안전하게 호출할 수 있습니다. (예: getAllItems)
 * 서버 액션에서는 이 함수 대신 triggerExpiredRentalsCheck를 사용하세요.
 * @returns {Promise<boolean>} DB 변경 여부
 */
export async function processAndMutateExpiredRentals(): Promise<boolean> {
  try {
    const now = Math.floor(Date.now() / 1000);

    // 1. 만료되었는데 아직 반납 안 된 기록들 조회
    const expiredRentals = await db
      .select({
        id: rentalRecords.id,
        itemsId: rentalRecords.itemsId,
        returnDueDate: rentalRecords.returnDueDate,
      })
      .from(rentalRecords)
      .where(
        and(
          eq(rentalRecords.isReturned, false),
          sql`${rentalRecords.returnDueDate} IS NOT NULL`,
          lte(rentalRecords.returnDueDate, now)
        )
      );

    if (expiredRentals.length === 0) {
      return false; // 변경된 내용이 없음을 알림
    }

    // 2. 각 만료 기록에 대해 '반납' 처리 후 '대기자 승급' 실행
    for (const record of expiredRentals) {
      // A. 반납 처리
      await db
        .update(rentalRecords)
        .set({
          isReturned: true,
          returnDate: record.returnDueDate, // 반납 예정일시를 실제 반납일시로 기록 (시간 초과 시점)
          isManualReturn: false, // 시스템 자동 반납
        })
        .where(eq(rentalRecords.id, record.id));

      // B. ★★★ 대기자가 있다면 즉시 자동 대여 처리 ★★★
      if (record.itemsId) {
        await processNextInQueue(record.itemsId);
      }
    }

    return true; // 변경사항 있음
  } catch (error) {
    console.error("Error during silent mutation of expired rentals:", error);
    return false;
  }
}

// [신규] 2. revalidatePath만 담당하는 "알림용" 래퍼 함수 (서버 액션용)
/**
 * 만료된 대여를 확인하고, 변경사항이 있으면 캐시(revalidatePath)까지 갱신합니다.
 * **반드시 서버 액션 안에서만 사용하세요.**
 */
export async function triggerExpiredRentalsCheck() {
  const hasChanges = await processAndMutateExpiredRentals();
  // DB에 변경이 있었을 때만 revalidate를 실행하여 불필요한 캐시 초기화를 방지
  if (hasChanges) {
    revalidatePath("/", "layout");
  }
}

/**
 * 대기자 자동 대여 처리
 * **중요**: 대기자가 실제로 대여를 시작할 때 현재 정보를 스냅샷으로 뜹니다.
 */
async function processNextInQueue(itemId: number) {
  try {
    // 1. 아이템 정보 조회
    const itemInfo = await db.query.items.findFirst({
      where: eq(items.id, itemId),
    });

    // 시간제 아이템이 아니면 패스
    if (!itemInfo || !itemInfo.isTimeLimited) return;

    // 2. 1순위 대기자 조회
    const nextUserEntry = await db.query.waitingQueue.findFirst({
      where: eq(waitingQueue.itemId, itemId),
      orderBy: [asc(waitingQueue.requestDate)],
    });

    // 대기자가 없으면 종료
    if (!nextUserEntry) return;

    // 3. 대기자 정보 조회 (삭제되었을 수도 있으므로 확인)
    const userToRent = await db.query.generalUsers.findFirst({
      where: eq(generalUsers.id, nextUserEntry.userId),
    });

    // 유저 정보가 없으면 대기열에서만 지우고 종료
    if (!userToRent) {
      await db
        .delete(waitingQueue)
        .where(eq(waitingQueue.id, nextUserEntry.id));
      return;
    }

    // 4. [자동 대여 실행]
    // 여기서 별도의 자격 검증(일일 한도 등)을 엄격하게 하기보다는,
    // 이미 대기열에 등록된 사용자는 '이용 권한이 있다'고 보고 승급시키는 것이
    // "자동화" 관점에서 끊김이 없습니다.

    const rentalDate = Math.floor(Date.now() / 1000);
    const returnDueDate = rentalDate + (itemInfo.rentalTimeMinutes || 0) * 60;

    // 트랜잭션 처럼 순차 실행 (대기열 삭제 -> 대여 기록 생성)
    // 에러가 나도 대기열이 막히는 것보다는, 일단 대기열을 비워주는게 낫습니다.

    // A. 대기열에서 삭제 (먼저 지워야 UI에서 "대기 1팀"이 사라짐)
    await db.delete(waitingQueue).where(eq(waitingQueue.id, nextUserEntry.id));

    // B. 대여 기록 생성
    await db.insert(rentalRecords).values({
      userId: nextUserEntry.userId,
      itemsId: itemId,
      rentalDate,
      returnDueDate,

      // 스냅샷 데이터
      userName: userToRent.name,
      userPhone: userToRent.phoneNumber,
      userSchool: userToRent.school,
      userGender: userToRent.gender,
      userBirthDate: userToRent.birthDate,

      itemName: itemInfo.name,
      itemCategory: itemInfo.category,
      isReturned: false,
      maleCount: nextUserEntry.maleCount,
      femaleCount: nextUserEntry.femaleCount,
    });

    console.log(
      `Auto-promoted waiting user ${userToRent.name} for item ${itemInfo.name}`
    );
  } catch (error) {
    console.error("Failed to process next in queue:", error);
    // 여기서 에러가 나더라도 다음 lazyCheck때 다시 시도되거나,
    // 최소한 시스템이 멈추지는 않아야 합니다.
  }
}

// ----------------------------------------------------------------------
// 조회 및 통계 액션
// ----------------------------------------------------------------------

export async function getAvailableRentalYears() {
  try {
    // 1. DB에서는 날짜 계산 없이 raw 타임스탬프 값만 모두 가져옵니다.
    const allDatesResult = await db
      .selectDistinct({ rentalDate: rentalRecords.rentalDate })
      .from(rentalRecords);

    if (!allDatesResult) {
      return { success: true, data: [] };
    }

    // 2. JavaScript의 Date 객체를 사용하여 연도를 계산합니다.
    //    Set을 사용하여 중복을 자동으로 제거합니다.
    const yearsSet = new Set<number>();
    allDatesResult.forEach((record) => {
      if (record.rentalDate) {
        const year = new Date(record.rentalDate * 1000).getFullYear();
        if (!isNaN(year)) {
          yearsSet.add(year);
        }
      }
    });

    // 3. Set을 배열로 변환하고 내림차순으로 정렬합니다.
    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);

    return { success: true, data: sortedYears };
  } catch (error) {
    console.error("Error fetching available rental years:", error);
    return { error: "사용 가능한 대여 연도를 불러오는 데 실패했습니다." };
  }
}

export async function getAllItemNames() {
  try {
    const itemNames = await db
      .selectDistinct({ name: items.name })
      .from(items)
      .where(and(sql`${items.name} IS NOT NULL`, eq(items.isDeleted, false))); // Ensure only non-deleted items with names are returned

    return { success: true, data: itemNames.map((item) => item.name) };
  } catch (error) {
    console.error("Error fetching all item names:", error);
    return { error: "물품명을 불러오는 데 실패했습니다." };
  }
}

export async function getRentalRecords(
  filters: {
    search?: string;
    startDate?: string;
    endDate?: string;
    itemName?: string;
    page?: number;
    per_page?: number;
    sort?: string;
    order?: string;
  } = {}
) {
  try {
    const {
      page = 1,
      per_page = 10,
      sort = "rentalDate",
      order = "desc",
    } = filters;
    const offset = (page - 1) * per_page;

    const whereConditions = [];
    if (filters.search) {
      // 1. 동반자 이름 검색용 서브쿼리
      const participantRecordIds = db
        .selectDistinct({ recordId: rentalRecordPeople.rentalRecordId })
        .from(rentalRecordPeople)
        .where(like(rentalRecordPeople.name, `%${filters.search}%`));

      // 2. OR 조건으로 통합
      whereConditions.push(
        or(
          // A. 사용자 이름 (현재 정보 또는 스냅샷)
          like(
            sql`COALESCE(${generalUsers.name}, ${rentalRecords.userName})`,
            `%${filters.search}%`
          ),
          // B. 학교 이름 (스냅샷 또는 현재 정보)
          like(
            sql`COALESCE(${rentalRecords.userSchool}, ${generalUsers.school})`,
            `%${filters.search}%`
          ),
          // C. 동반자 이름
          inArray(rentalRecords.id, participantRecordIds)
        )
      );
    }
    if (filters.startDate) {
      const [year, month, day] = filters.startDate.split("-").map(Number);
      const startOfDay = new Date(year, month - 1, day);
      startOfDay.setHours(0, 0, 0, 0);
      whereConditions.push(
        gte(rentalRecords.rentalDate, Math.floor(startOfDay.getTime() / 1000))
      );
    }
    if (filters.endDate) {
      const [year, month, day] = filters.endDate.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      date.setHours(23, 59, 59, 999);
      whereConditions.push(
        lte(rentalRecords.rentalDate, Math.floor(date.getTime() / 1000))
      );
    }
    if (filters.itemName) {
      whereConditions.push(eq(items.name, filters.itemName));
    }

    // [중요] 우선순위 적용
    // 학교: 스냅샷(rentalRecords.userSchool) 우선 -> 없으면 현재 정보
    // 이름/폰: 현재 정보(generalUsers) 우선 -> 없으면(삭제됨) 스냅샷
    const baseQuery = db
      .select({
        id: rentalRecords.id,
        rentalDate: rentalRecords.rentalDate,
        userId: generalUsers.id,
        userName: sql<string>`COALESCE(${generalUsers.name}, ${rentalRecords.userName})`,
        userPhone: sql<string>`COALESCE(${generalUsers.phoneNumber}, ${rentalRecords.userPhone})`,
        // 학교는 과거 기록이 중요하므로 스냅샷 우선
        userSchool: sql<string>`COALESCE(${rentalRecords.userSchool}, ${generalUsers.school})`,
        userBirthDate: sql<
          string | null
        >`COALESCE(${rentalRecords.userBirthDate}, ${generalUsers.birthDate})`,
        itemName: sql<string>`COALESCE(${items.name}, ${rentalRecords.itemName})`,
        itemCategory: sql<string>`COALESCE(${items.category}, ${rentalRecords.itemCategory})`,
        maleCount: rentalRecords.maleCount,
        femaleCount: rentalRecords.femaleCount,
        visitSessionId: rentalRecords.visitSessionId,
        visitTotalCount: visitSessions.totalCount,
        visitYouthMale: visitSessions.youthMale,
        visitYouthFemale: visitSessions.youthFemale,
        visitAdultMale: visitSessions.adultMale,
        visitAdultFemale: visitSessions.adultFemale,
      })
      .from(rentalRecords)
      .leftJoin(generalUsers, eq(rentalRecords.userId, generalUsers.id))
      .leftJoin(items, eq(rentalRecords.itemsId, items.id))
      .leftJoin(
        visitSessions,
        eq(rentalRecords.visitSessionId, visitSessions.id)
      );

    const filteredQuery =
      whereConditions.length > 0
        ? baseQuery.where(and(...whereConditions))
        : baseQuery;

    const dataQuery = filteredQuery.limit(per_page).offset(offset);

    if (sort) {
      const sortColumnMap = {
        rentalDate: rentalRecords.rentalDate,
        username: generalUsers.name,
        itemName: items.name,
        maleCount: rentalRecords.maleCount,
        femaleCount: rentalRecords.femaleCount,
      };
      const sortColumn =
        sortColumnMap[sort as keyof typeof sortColumnMap] ||
        rentalRecords.rentalDate;
      dataQuery.orderBy(order === "asc" ? asc(sortColumn) : desc(sortColumn));
    }

    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(rentalRecords)
      .leftJoin(generalUsers, eq(rentalRecords.userId, generalUsers.id))
      .leftJoin(items, eq(rentalRecords.itemsId, items.id))
      .leftJoin(
        visitSessions,
        eq(rentalRecords.visitSessionId, visitSessions.id)
      )
      .where(and(...whereConditions));

    const [data, total] = await Promise.all([dataQuery, countQuery]);

    const total_count = total[0]?.count || 0;

    return { success: true, data, total_count };
  } catch (error) {
    console.error("Error fetching rental records:", error);
    return { error: "대여 기록을 불러오는 데 실패했습니다." };
  }
}
export async function getRentalRecordsByUserId(
  userId: number,
  filters: {
    startDate?: string;
    endDate?: string;
    itemName?: string;
    page?: number;
    per_page?: number;
    sort?: string;
    order?: string;
  } = {}
) {
  try {
    const {
      page = 1,
      per_page = 10,
      sort = "rentalDate",
      order = "desc",
    } = filters;
    const offset = (page - 1) * per_page;

    const whereConditions = [eq(rentalRecords.userId, userId)];
    if (filters.startDate) {
      const startOfDay = new Date(filters.startDate);
      whereConditions.push(
        gte(rentalRecords.rentalDate, Math.floor(startOfDay.getTime() / 1000))
      );
    }
    if (filters.endDate) {
      const endOfDay = new Date(filters.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      whereConditions.push(
        lte(rentalRecords.rentalDate, Math.floor(endOfDay.getTime() / 1000))
      );
    }
    if (filters.itemName) {
      whereConditions.push(eq(items.name, filters.itemName));
    }

    // --- 데이터 조회 쿼리 ---
    const sortColumnMap = {
      rentalDate: rentalRecords.rentalDate,
      username: generalUsers.name,
      itemName: items.name,
      maleCount: rentalRecords.maleCount,
      femaleCount: rentalRecords.femaleCount,
    };
    const sortColumn =
      sortColumnMap[sort as keyof typeof sortColumnMap] ||
      rentalRecords.rentalDate;

    // 사용자 정보는 본인 조회이므로 크게 중요하진 않으나 일관성 유지
    const dataQuery = db
      .select({
        id: rentalRecords.id,
        rentalDate: rentalRecords.rentalDate,
        userName: sql<string>`COALESCE(${generalUsers.name}, ${rentalRecords.userName})`,
        // 학교는 스냅샷 우선
        userSchool: sql<string>`COALESCE(${rentalRecords.userSchool}, ${generalUsers.school})`,
        itemName: sql<string>`COALESCE(${items.name}, ${rentalRecords.itemName})`,
        itemCategory: sql<string>`COALESCE(${items.category}, ${rentalRecords.itemCategory})`,
        maleCount: rentalRecords.maleCount,
        femaleCount: rentalRecords.femaleCount,
        imageUrl: items.imageUrl,
      })
      .from(rentalRecords)
      .leftJoin(generalUsers, eq(rentalRecords.userId, generalUsers.id))
      .leftJoin(items, eq(rentalRecords.itemsId, items.id))
      .where(and(...whereConditions))
      .limit(per_page)
      .offset(offset)
      .orderBy(order === "asc" ? asc(sortColumn) : desc(sortColumn));

    // --- 카운트 조회 쿼리 ---
    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(rentalRecords)
      .leftJoin(generalUsers, eq(rentalRecords.userId, generalUsers.id))
      .leftJoin(items, eq(rentalRecords.itemsId, items.id))
      .where(and(...whereConditions));

    // 병렬 실행
    const [data, total] = await Promise.all([dataQuery, countQuery]);

    const total_count = total[0]?.count || 0;

    return { success: true, data, total_count };
  } catch (error) {
    console.error("Error fetching rental records by user ID:", error);
    return { error: "사용자 대여 기록을 불러오는 데 실패했습니다." };
  }
}

// ----------------------------------------------------------------------
// 통계 분석 (핵심 로직 변경)
// ----------------------------------------------------------------------

export async function getRentalAnalytics(filters: {
  year: string;
  month: string | "all";
  ageGroup?: string;
  category?: string;
}): Promise<AnalyticsData> {
  const { year, month, ageGroup, category } = filters;

  try {
    const whereConditions = [];

    const yearNum = parseInt(year);
    if (isNaN(yearNum)) {
      // 유효하지 않은 연도 입력 시 빈 데이터 반환 또는 에러 처리
      throw new Error(`Invalid year provided: ${year}`);
    }

    const startMonth = month === "all" ? 0 : parseInt(month) - 1;
    const startDate = new Date(yearNum, startMonth, 1);
    const endDate = new Date(startDate);
    if (month === "all") {
      endDate.setFullYear(yearNum + 1);
    } else {
      endDate.setMonth(startMonth + 1);
    }
    endDate.setDate(0);
    endDate.setHours(23, 59, 59, 999);

    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    whereConditions.push(gte(rentalRecords.rentalDate, startTimestamp));
    whereConditions.push(lte(rentalRecords.rentalDate, endTimestamp));

    if (category && category !== "all") {
      whereConditions.push(eq(items.category, category));
    }

    // [통계 조회] 스냅샷 컬럼 활용
    const baseQuery = db
      .select({
        rentalDate: rentalRecords.rentalDate,
        userId: rentalRecords.userId,

        // 현재 사용자 정보
        currentBirthDate: generalUsers.birthDate,
        currentGender: generalUsers.gender,
        currentSchool: generalUsers.school,

        // 스냅샷 정보 (삭제/변경 대비)
        snapBirthDate: rentalRecords.userBirthDate,
        snapGender: rentalRecords.userGender,
        snapSchool: rentalRecords.userSchool,

        // 아이템 정보
        itemName: items.name,
        itemId: items.id,
        itemCategory: items.category,
        recordItemId: rentalRecords.itemsId,
        recordItemName: rentalRecords.itemName,
        recordItemCategory: rentalRecords.itemCategory,

        maleCount: rentalRecords.maleCount,
        femaleCount: rentalRecords.femaleCount,
      })
      .from(rentalRecords)
      .leftJoin(generalUsers, eq(rentalRecords.userId, generalUsers.id))
      .leftJoin(items, eq(rentalRecords.itemsId, items.id))
      .where(and(...whereConditions));

    let recordsRaw = await baseQuery;

    // 데이터 정제 및 우선순위 적용
    const records = recordsRaw.map((r) => {
      // 1. 학교: 기록된 스냅샷이 있으면 우선 사용 (과거 이력 보존), 없으면 현재 정보
      const finalSchool = r.snapSchool ?? r.currentSchool ?? "기타";

      // 2. 생년월일/성별: 현재 정보 우선(수정 반영), 없으면(삭제됨) 스냅샷 사용
      const finalBirthDate = r.currentBirthDate ?? r.snapBirthDate;
      const finalGender = r.currentGender ?? r.snapGender; // 현재 사용 안 하지만 로직상 확보

      return {
        ...r,
        school: finalSchool,
        birthDate: finalBirthDate,
        // (필요 시 gender: finalGender 추가 가능)
      };
    });

    // 나이 필터링
    let filteredRecords = records;
    if (ageGroup && ageGroup !== "all") {
      filteredRecords = records.filter((r) => {
        if (!r.birthDate) return false;
        const age = calculateAge(r.birthDate, new Date(r.rentalDate * 1000));
        if (age === null) return false;

        if (ageGroup === "child" && age <= 8) return true;
        if (ageGroup === "teen" && age > 8 && age <= 24) return true;
        if (ageGroup === "adult" && age > 24) return true;
        return false;
      });
    }

    const totalRentals = filteredRecords.length;
    const uniqueUsers = new Set(filteredRecords.map((r) => r.userId)).size;

    // 아이템 통계 (스냅샷 fallback 적용)
    const itemCounts = filteredRecords.reduce((acc, r) => {
      const id = r.itemId || r.recordItemId;
      const name = r.itemName || r.recordItemName;
      const category = r.itemCategory || r.recordItemCategory || "Unknown";

      if (id && typeof id === "number") {
        acc[id] = acc[id] || {
          id: id,
          name: name,
          category: category,
          rentals: 0,
        };
        acc[id].rentals++;
      }
      return acc;
    }, {} as Record<number, { id: number; name: string | null; category: string; rentals: number }>);

    const mostPopularItem =
      Object.values(itemCounts).sort((a, b) => b.rentals - a.rentals)[0] ||
      null;

    const categoryCounts = filteredRecords.reduce((acc, r) => {
      const category = r.itemCategory || r.recordItemCategory;
      if (category) {
        acc[category] = acc[category] || { name: category, rentals: 0 };
        acc[category].rentals++;
      }
      return acc;
    }, {} as Record<string, { name: string; rentals: number }>);

    const mostPopularCategory =
      Object.values(categoryCounts).sort((a, b) => b.rentals - a.rentals)[0] ||
      null;

    const ageGroupStats = {
      child: { count: 0, uniqueUsers: new Set<number | null>() },
      teen: { count: 0, uniqueUsers: new Set<number | null>() },
      adult: { count: 0, uniqueUsers: new Set<number | null>() },
    };

    filteredRecords.forEach((r) => {
      if (r.birthDate) {
        const age = calculateAge(r.birthDate, new Date(r.rentalDate * 1000));
        if (age !== null) {
          if (age <= 8) {
            ageGroupStats.child.count++;
            ageGroupStats.child.uniqueUsers.add(r.userId);
          } else if (age <= 24) {
            ageGroupStats.teen.count++;
            ageGroupStats.teen.uniqueUsers.add(r.userId);
          } else {
            ageGroupStats.adult.count++;
            ageGroupStats.adult.uniqueUsers.add(r.userId);
          }
        }
      }
    });

    const categoryStats = Object.entries(categoryCounts)
      .map(([name, data]) => {
        const itemsInCategory = filteredRecords.filter(
          (r) => (r.itemCategory || r.recordItemCategory) === name
        );
        const topItemsInCategory = Object.values(
          itemsInCategory.reduce((acc, r) => {
            const id = r.itemId || r.recordItemId;
            const name = r.itemName || r.recordItemName || "Unknown";

            if (id && typeof id === "number") {
              acc[id] = acc[id] || {
                itemId: id,
                itemName: name,
                rentals: 0,
              };
              acc[id].rentals++;
            }
            return acc;
          }, {} as Record<number, { itemId: number; itemName: string; rentals: number }>)
        ).sort((a, b) => b.rentals - a.rentals);

        return {
          category: name,
          totalRentals: data.rentals,
          percentage:
            totalRentals > 0 ? (data.rentals / totalRentals) * 100 : 0,
          topItems: topItemsInCategory.slice(0, 5),
        };
      })
      .sort((a, b) => b.totalRentals - a.totalRentals);

    const allItemCounts = Object.values(itemCounts).sort(
      (a, b) => b.rentals - a.rentals
    );
    const topItems = allItemCounts.slice(0, 10);
    const unpopularItems = allItemCounts
      .filter((item) => item.rentals <= 5)
      .reverse();

    const dayOfWeekStats = Array(7)
      .fill(0)
      .map((_, i) => ({
        name: ["일", "월", "화", "수", "목", "금", "토"][i],
        count: 0,
      }));
    const hourStats = Array(24)
      .fill(0)
      .map((_, i) => ({ name: `${i}시`, count: 0 }));

    filteredRecords.forEach((r) => {
      const date = new Date(r.rentalDate * 1000);
      dayOfWeekStats[date.getDay()].count++;
      hourStats[date.getHours()].count++;
    });

    const genderCounts = filteredRecords.reduce(
      (acc, r) => {
        acc.male += r.maleCount || 0;
        acc.female += r.femaleCount || 0;
        return acc;
      },
      { male: 0, female: 0 }
    );

    const genderStats = [
      { name: "남성", value: genderCounts.male },
      { name: "여성", value: genderCounts.female },
    ].filter((g) => g.value > 0);

    // 학교 랭킹
    const schoolCounts: {
      [school: string]: {
        school: string;
        totalRentals: number;
        users: Set<number>;
      };
    } = {};

    filteredRecords.forEach((r) => {
      if (r.school) {
        if (!schoolCounts[r.school]) {
          schoolCounts[r.school] = {
            school: r.school,
            totalRentals: 0,
            users: new Set(),
          };
        }
        schoolCounts[r.school].totalRentals += 1;
        if (r.userId) schoolCounts[r.school].users.add(r.userId);
      }
    });
    const schoolRankings = Object.values(schoolCounts)
      .map((item) => ({
        school: item.school,
        totalRentals: item.totalRentals,
        uniqueUsers: item.users.size,
      }))
      .sort((a, b) => b.totalRentals - a.totalRentals);

    // 인원수별 통계
    const peopleItemStats: {
      [key: number]: {
        [itemId: number]: { itemId: number; itemName: string; rentals: number };
      };
    } = {};

    filteredRecords.forEach((r) => {
      // 1. 인원수 합산 (JS 계산)
      const p = (r.maleCount || 0) + (r.femaleCount || 0);

      // 2. 0명인 경우 집계 제외 (불필요한 0명 카드 생성 방지)
      if (p === 0) return;

      // 3. 아이템 ID/Name 결정 (스냅샷 사용으로 삭제된 아이템도 표시)
      const finalItemId = r.itemId || r.recordItemId;
      const finalItemName = r.itemName || r.recordItemName || "Unknown";

      // 4. 유효한 ID가 있을 때만 버킷 생성 및 집계
      if (finalItemId && typeof finalItemId === "number") {
        // 해당 인원수 그룹이 없을 때만 생성 (즉, 데이터가 확실히 있을 때만 그룹 생성)
        if (!peopleItemStats[p]) {
          peopleItemStats[p] = {};
        }

        if (!peopleItemStats[p][finalItemId]) {
          peopleItemStats[p][finalItemId] = {
            itemId: finalItemId,
            itemName: finalItemName,
            rentals: 0,
          };
        }
        peopleItemStats[p][finalItemId].rentals++;
      }
    });

    const peopleCountItemStats = Object.keys(peopleItemStats)
      .map((count) => {
        const peopleCount = Number(count);
        return {
          peopleCount: peopleCount,
          items: Object.values(peopleItemStats[peopleCount]).sort(
            (a, b) => b.rentals - a.rentals
          ),
        };
      })
      .sort((a, b) => a.peopleCount - b.peopleCount); // 1인, 2인 순서 정렬

    return {
      kpis: { totalRentals, uniqueUsers, mostPopularItem, mostPopularCategory },
      ageGroupStats: {
        child: {
          count: ageGroupStats.child.count,
          uniqueUsers: ageGroupStats.child.uniqueUsers.size,
          percentage:
            totalRentals > 0
              ? (ageGroupStats.child.count / totalRentals) * 100
              : 0,
        },
        teen: {
          count: ageGroupStats.teen.count,
          uniqueUsers: ageGroupStats.teen.uniqueUsers.size,
          percentage:
            totalRentals > 0
              ? (ageGroupStats.teen.count / totalRentals) * 100
              : 0,
        },
        adult: {
          count: ageGroupStats.adult.count,
          uniqueUsers: ageGroupStats.adult.uniqueUsers.size,
          percentage:
            totalRentals > 0
              ? (ageGroupStats.adult.count / totalRentals) * 100
              : 0,
        },
      },
      categoryStats,
      itemStats: { topItems, unpopularItems },
      dayOfWeekStats,
      hourStats,
      genderStats,
      schoolRankings,
      peopleCountItemStats,
    };
  } catch (error) {
    console.error("Error fetching rental analytics:", error);
    // 빈 데이터 반환 (에러 시에도 UI가 깨지지 않도록)
    return {
      kpis: {
        totalRentals: 0,
        uniqueUsers: 0,
        mostPopularItem: null,
        mostPopularCategory: null,
      },
      ageGroupStats: {
        child: { count: 0, uniqueUsers: 0, percentage: 0 },
        teen: { count: 0, uniqueUsers: 0, percentage: 0 },
        adult: { count: 0, uniqueUsers: 0, percentage: 0 },
      },
      categoryStats: [],
      itemStats: { topItems: [], unpopularItems: [] },
      dayOfWeekStats: [],
      hourStats: [],
      genderStats: [],
      schoolRankings: [],
      peopleCountItemStats: [],
    };
  }
}
export async function exportRentalRecordsToExcel(
  filters: {
    username?: string;
    startDate?: string;
    endDate?: string;
    itemName?: string;
  } = {}
) {
  try {
    const { data, error } = await getRentalRecords({
      ...filters,
      per_page: 999999,
    }); // 매우 큰 값으로 설정하여 모든 데이터를 가져옴

    if (error || !data) {
      throw new Error(error || "대여 기록을 가져오는 데 실패했습니다.");
    }

    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("쌍청문 쉬다 대여 기록");

    // 헤더 설정
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "대여 날짜", key: "rentalDate", width: 25 },
      { header: "사용자 이름", key: "userName", width: 15 },
      { header: "나이(만)", key: "age", width: 10 },
      { header: "연령대", key: "ageGroup", width: 10 },
      { header: "학교", key: "userSchool", width: 15 },
      { header: "아이템 이름", key: "itemName", width: 20 },
      { header: "아이템 카테고리", key: "itemCategory", width: 15 },
      { header: "남자 인원", key: "maleCount", width: 10 },
      { header: "여자 인원", key: "femaleCount", width: 10 },
    ];

    // 헤더 스타일 적용
    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD3D3D3" },
      };
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 0) {
        row.eachCell((cell) => {
          cell.alignment = { vertical: "middle", horizontal: "center" };
        });
      }
    });

    data.forEach((record) => {
      // 대여 시점 날짜 객체 생성
      const rentalDateObj = new Date(record.rentalDate * 1000);

      const age = calculateAge(record.userBirthDate, rentalDateObj);
      const ageGroup = getAgeGroup(age);

      worksheet.addRow({
        id: record.id,
        rentalDate: rentalDateObj.toLocaleString("ko-KR"),
        userName: record.userName,
        age: age !== null ? age : "-", // 나이 데이터 매핑
        ageGroup: ageGroup, // 나이대 데이터 매핑
        userSchool: record.userSchool,
        itemName: record.itemName,
        itemCategory: record.itemCategory,
        maleCount: record.maleCount,
        femaleCount: record.femaleCount,
      });
    });

    // 엑셀 파일을 버퍼로 생성
    const buffer = await (workbook.xlsx as any).writeBuffer();

    // 클라이언트로 반환할 수 있도록 버퍼와 MIME 타입 반환
    return {
      success: true,
      buffer: buffer.toString("base64"),
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  } catch (error) {
    console.error("Error exporting rental records to Excel:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "엑셀 내보내기 중 오류가 발생했습니다.",
    };
  }
}

export async function deleteRentalRecord(recordId: number) {
  try {
    await db.delete(rentalRecords).where(eq(rentalRecords.id, recordId));
    revalidatePath("/admin/records");
    return { success: true, message: "대여 기록이 삭제되었습니다." };
  } catch (error) {
    console.error("Delete Rental Record Failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "대여 기록 삭제 중 오류가 발생했습니다.",
    };
  }
}
//모든 활성 대여 목록을 가져오는 함수
export async function getActiveRentalsWithWaitCount() {
  try {
    const waitCountSubquery = db
      .select({
        itemId: waitingQueue.itemId,
        count: sql<number>`count(*)`.as("wait_count"),
      })
      .from(waitingQueue)
      .groupBy(waitingQueue.itemId)
      .as("wait_counts");

    const activeRentals = await db
      .select({
        recordId: rentalRecords.id,
        itemName: items.name,
        userName: generalUsers.name,
        rentalDate: rentalRecords.rentalDate,
        returnDueDate: rentalRecords.returnDueDate,
        waitCount: sql<number>`COALESCE(${waitCountSubquery.count}, 0)`.mapWith(
          Number
        ),
        itemsId: rentalRecords.itemsId,
      })
      .from(rentalRecords)
      .leftJoin(items, eq(rentalRecords.itemsId, items.id))
      .leftJoin(generalUsers, eq(rentalRecords.userId, generalUsers.id))
      .leftJoin(
        waitCountSubquery,
        eq(rentalRecords.itemsId, waitCountSubquery.itemId)
      )
      .where(
        and(eq(items.isTimeLimited, true), eq(rentalRecords.isReturned, false))
      );

    return { success: true, data: activeRentals };
  } catch (error) {
    console.error("Error fetching active rentals with wait count:", error);
    return { error: "활성 대여 목록을 불러오는 데 실패했습니다." };
  }
}

export async function getCurrentRenter(itemId: number) {
  try {
    // 현재 대여자는 스냅샷보다는 현재 정보를 보여주는 것이 일반적일 수 있으나
    // 일관성을 위해 COALESCE 사용 가능. 여기서는 정보 확인 용도이므로 스냅샷+현재 혼용
    const record = await db
      .select({
        id: rentalRecords.id,
        userName: sql<string>`COALESCE(${generalUsers.name}, ${rentalRecords.userName})`,
        userPhone: sql<string>`COALESCE(${generalUsers.phoneNumber}, ${rentalRecords.userPhone})`,
        userSchool: sql<string>`COALESCE(${rentalRecords.userSchool}, ${generalUsers.school})`, // 스냅샷 우선
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
          eq(rentalRecords.isReturned, false) // 반납 안 된 기록만
        )
      )
      .limit(1); // 하나만 가져옴

    if (record.length === 0) return { success: true, data: null };

    return { success: true, data: record[0] };
  } catch (error) {
    console.error("Error fetching current renter:", error);
    return { error: "현재 대여자 정보를 불러오지 못했습니다." };
  }
}

export async function extendRentalTime(rentalRecordId: number) {
  try {
    const rentalRecord = await db.query.rentalRecords.findFirst({
      where: eq(rentalRecords.id, rentalRecordId),
    });

    if (!rentalRecord || !rentalRecord.itemsId || !rentalRecord.returnDueDate) {
      throw new Error(
        "연장할 대여 기록을 찾을 수 없거나, 연장 가능한 항목이 아닙니다."
      );
    }

    const itemId = rentalRecord.itemsId;

    const item = await db.query.items.findFirst({
      where: eq(items.id, itemId),
    });

    if (!item || !item.isTimeLimited || !item.rentalTimeMinutes) {
      throw new Error(
        "연장할 아이템 정보를 찾을 수 없거나, 시간제 대여 아이템이 아닙니다."
      );
    }

    const waitingUser = await db.query.waitingQueue.findFirst({
      where: eq(waitingQueue.itemId, itemId),
    });

    if (waitingUser) {
      throw new Error("대기자가 있어 연장할 수 없습니다.");
    }

    const newReturnDueDate =
      rentalRecord.returnDueDate + item.rentalTimeMinutes * 60;

    await db
      .update(rentalRecords)
      .set({ returnDueDate: newReturnDueDate })
      .where(eq(rentalRecords.id, rentalRecordId));

    revalidatePath("/admin/waitings");

    return { success: true, message: "대여 시간이 연장되었습니다." };
  } catch (error) {
    console.error("Extend Rental Time Failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "대여 시간 연장 중 오류가 발생했습니다.",
    };
  }
}
export async function checkUserRentalStatus(userId: number, itemId: number) {
  try {
    const item = await db.query.items.findFirst({
      where: eq(items.id, itemId),
      columns: { isTimeLimited: true },
    });

    if (!item) {
      return {
        isRenting: false,
        isWaiting: false,
        error: "아이템 정보를 찾을 수 없습니다.",
      };
    }

    const now = Math.floor(Date.now() / 1000);

    // 1. 현재 대여 중인지 확인
    if (item.isTimeLimited) {
      const currentRental = await db
        .select({
          id: rentalRecords.id,
          returnDueDate: rentalRecords.returnDueDate, // [중요] 마감 시간 확인을 위해 추가
        })
        .from(rentalRecords)
        .where(
          and(
            eq(rentalRecords.userId, userId),
            eq(rentalRecords.itemsId, itemId),
            eq(rentalRecords.isReturned, false)
          )
        )
        .get();

      if (currentRental) {
        // [핵심 수정] 본인이 빌리고 있더라도, '반납 시간'이 지났다면
        // 재등록/갱신을 위해 '대여 중이 아님'으로 통과시킵니다.
        if (currentRental.returnDueDate && currentRental.returnDueDate < now) {
          // 통과 (아래 대기열 체크 로직으로 넘어감)
        } else {
          // 정상 대여 중이면 차단
          return { isRenting: true, isWaiting: false, error: null };
        }
      }
    }

    // 2. 대기열 확인
    const waitingEntry = await db
      .select({ id: waitingQueue.id })
      .from(waitingQueue)
      .where(
        and(eq(waitingQueue.userId, userId), eq(waitingQueue.itemId, itemId))
      )
      .get();

    if (waitingEntry) {
      // ★★★ 핵심 수정: 대기열에 있지만 "재등록이 허용되는 상황" 체크 ★★★

      // A. 현재 이 아이템을 누가 쓰고 있는지 확인
      const activeRental = await db.query.rentalRecords.findFirst({
        where: and(
          eq(rentalRecords.itemsId, itemId),
          eq(rentalRecords.isReturned, false)
        ),
      });

      // 자리가 비었거나(좀비), 현재 사용자가 연체 중이면 -> 재등록 허용 (isWaiting: false)
      if (!activeRental) {
        // 대기 중이지만, 사실상 바로 빌릴 수 있는 상태이므로
        // 클라이언트가 addToWaitingList를 호출하게 유도하기 위해 waiting=false로 속임
        return { isRenting: false, isWaiting: false, error: null };
      }

      // 상황 2: 누군가 쓰고 있지만, 반납 예정 시간이 지남 (연체 상태)
      if (activeRental.returnDueDate && activeRental.returnDueDate < now) {
        return { isRenting: false, isWaiting: false, error: null };
      }

      // 상황 3: 정상적인 대기 상태 (자리 꽉 참 + 시간 남음) -> 차단
      return { isRenting: false, isWaiting: true, error: null };
    }

    return { isRenting: false, isWaiting: false, error: null };
  } catch (error) {
    console.error("Error checking user rental status:", error);
    return {
      isRenting: false,
      isWaiting: false,
      error: "사용자 대여 상태 확인 중 오류가 발생했습니다.",
    };
  }
}
export async function getRentalRecordPeople(rentalRecordId: number) {
  try {
    const people = await db
      .select()
      .from(rentalRecordPeople)
      .where(eq(rentalRecordPeople.rentalRecordId, rentalRecordId));
    return { success: true, data: people };
  } catch (error) {
    console.error("Error fetching rental record people:", error);
    return { success: false, error: "Failed to fetch rental record people." };
  }
}
