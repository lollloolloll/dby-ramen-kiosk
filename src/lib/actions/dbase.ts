"use server";

import { db } from "@/lib/db";
import { assertValidHeadcount, type DbaseHeadcount } from "@/lib/dbase/headcount";
import {
  generalUsers,
  items,
  rentalRecords,
  visitSessions,
} from "@drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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
  // 이름+전화번호가 겹치는 기존 회원이 있어도 "다른 사람이야" 확인을 거쳤다면
  // 새 레코드로 강제 등록한다.
  forceNewRecord: z.boolean().optional().default(false),
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

export type DbaseRegisterResult =
  | { success: true; user: DbaseRegisteredUser }
  // 이름+전화번호가 겹치는 회원이 이미 있음 — 본인 확인이 필요하다.
  | { needsConfirmation: true; existingUser: DbaseRegisteredUser }
  | { error: string };

export async function registerDbaseUser(
  input: unknown
): Promise<DbaseRegisterResult> {
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

  const {
    name,
    phoneNumber,
    gender,
    birthDate,
    school,
    personalInfoConsent,
    forceNewRecord,
  } = parsed.data;

  try {
    // 이름+전화번호만으로 조회 — 가족 공유폰 등으로 전화번호만 겹치는 건
    // 정상이라 걸러지지 않고, 이름까지 겹칠 때만 확인이 필요하다.
    const existingUser = await db.query.generalUsers.findFirst({
      where: and(
        eq(generalUsers.name, name),
        eq(generalUsers.phoneNumber, phoneNumber)
      ),
    });

    if (existingUser && !forceNewRecord) {
      return {
        needsConfirmation: true,
        existingUser: { id: existingUser.id, name: existingUser.name },
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
    if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
      return {
        error: "이미 동일한 정보로 등록된 회원이에요. '또 왔어요'를 이용해줘.",
      };
    }
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

    revalidatePath("/", "layout");
    revalidatePath("/kiosk/dby");
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
