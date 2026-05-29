"use server";

import { db } from "@/lib/db";
import { assertValidHeadcount, type DbaseHeadcount } from "@/lib/dbase/headcount";
import { generalUsers, items, rentalRecords, visitSessions } from "@drizzle/schema";
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
  personalInfoConsent: z.literal(true, {
    message: "개인정보 동의가 필요합니다.",
  }),
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

export type DbaseVisitResult = {
  sessionId: number;
  contents: string[];
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
        "유효하지 않은 사용자 정보입니다.",
    };
  }

  const { name, phoneNumber, gender, birthDate, personalInfoConsent } =
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
        school: "",
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

    const rentalDate = Math.floor(Date.now() / 1000);
    const session = db.transaction((tx) => {
      const [newSession] = tx
        .insert(visitSessions)
        .values({
          generalUserId: userId,
          totalCount: headcount.totalCount,
          youthMale: headcount.youthMale,
          youthFemale: headcount.youthFemale,
          adultMale: headcount.adultMale,
          adultFemale: headcount.adultFemale,
        })
        .returning({ id: visitSessions.id })
        .all();

      tx.insert(rentalRecords).values(
        selectedItems.map((item) => ({
          userId,
          visitSessionId: newSession.id,
          itemsId: item.id,
          maleCount: headcount.youthMale + headcount.adultMale,
          femaleCount: headcount.youthFemale + headcount.adultFemale,
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
        }))
      ).run();

      return newSession;
    });

    revalidatePath("/");
    revalidatePath("/kiosk/dby");
    revalidatePath("/admin/records");

    return {
      success: true,
      data: {
        sessionId: session.id,
        contents: selectedItems.map((item) => item.name),
      },
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
