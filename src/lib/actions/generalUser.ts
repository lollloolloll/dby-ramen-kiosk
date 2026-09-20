"use server";

import { db } from "@/lib/db";
import { generalUsers, users } from "@drizzle/schema";
import { eq, asc, desc, like, or, sql, and, count } from "drizzle-orm";
import { generalUserSchema } from "@/lib/validators/generalUser";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { getSchoolLevel } from "@/lib/shared/school";

export type UserCheckResult =
  | { status: "exact_match"; user: typeof generalUsers.$inferSelect }
  | {
      status: "family_exists";
      existingUsers: (typeof generalUsers.$inferSelect)[];
    } // 변경
  | { status: "name_exists_phone_mismatch" }
  | { status: "not_found" };

export type UserPinLookupResult =
  | { status: "single_match"; user: typeof generalUsers.$inferSelect }
  | {
      status: "multiple_matches";
      users: (typeof generalUsers.$inferSelect)[];
    }
  | { status: "not_found" };

const getMiddleFourDigits = (phoneNumber: string) => {
  const digits = phoneNumber.replace(/[^\d]/g, "");

  if (digits.length < 8) {
    return "";
  }

  return digits.slice(3, 7);
};

// 기존 함수 이름을 그대로 쓰면서 기능만 업그레이드
export async function findUserByNameAndPhone(
  name: string,
  phoneNumber: string
): Promise<UserCheckResult> {
  // 리턴 타입 변경

  // 1. 이름이나 전화번호 중 하나라도 맞는게 있는지 한 번에 조회 (효율적)
  const users = await db
    .select()
    .from(generalUsers)
    .where(
      or(eq(generalUsers.name, name), eq(generalUsers.phoneNumber, phoneNumber))
    );

  // 결과가 없으면 완전 신규
  if (users.length === 0) {
    return { status: "not_found" };
  }

  // 2. 조회된 결과들을 분석
  const exactMatch = users.find(
    (u) => u.name === name && u.phoneNumber === phoneNumber
  );
  if (exactMatch) {
    return { status: "exact_match", user: exactMatch };
  }

  const phoneMatches = users.filter((u) => u.phoneNumber === phoneNumber);
  if (phoneMatches.length > 0) {
    // 같은 번호를 쓰는 다른 이름의 사람들 (가족)
    return { status: "family_exists", existingUsers: phoneMatches };
  }

  const nameMatch = users.find((u) => u.name === name);
  if (nameMatch) {
    return { status: "name_exists_phone_mismatch" };
  }

  return { status: "not_found" };
}

// 이름 없이 전화번호 가운데 4자리만으로 조회 — 겹치는 회원이 있을 때만
// 호출 측에서 이름을 추가로 물어 좁히는 용도.
export async function findUsersByPin(
  pin: string
): Promise<UserPinLookupResult> {
  const normalizedPin = pin.replace(/[^\d]/g, "");

  if (normalizedPin.length !== 4) {
    return { status: "not_found" };
  }

  const allUsers = await db.select().from(generalUsers);

  const pinMatchedUsers = allUsers.filter(
    (user) => getMiddleFourDigits(user.phoneNumber) === normalizedPin
  );

  if (pinMatchedUsers.length === 0) {
    return { status: "not_found" };
  }

  if (pinMatchedUsers.length === 1) {
    return { status: "single_match", user: pinMatchedUsers[0] };
  }

  return { status: "multiple_matches", users: pinMatchedUsers };
}

export async function findUsersByNameAndPin(
  name: string,
  pin: string
): Promise<UserPinLookupResult> {
  const normalizedName = name.trim().replace(/\s/g, "");
  const normalizedPin = pin.replace(/[^\d]/g, "");

  if (!normalizedName || normalizedPin.length !== 4) {
    return { status: "not_found" };
  }

  const matchedUsers = await db
    .select()
    .from(generalUsers)
    .where(eq(generalUsers.name, normalizedName));

  const pinMatchedUsers = matchedUsers.filter(
    (user) => getMiddleFourDigits(user.phoneNumber) === normalizedPin
  );

  if (pinMatchedUsers.length === 0) {
    return { status: "not_found" };
  }

  if (pinMatchedUsers.length === 1) {
    return { status: "single_match", user: pinMatchedUsers[0] };
  }

  return { status: "multiple_matches", users: pinMatchedUsers };
}

// 2. 사용자 생성 함수 수정
export async function createGeneralUser(data: unknown) {
  const validatedData = generalUserSchema.safeParse(data);
  if (!validatedData.success) {
    console.error("Validation Error:", validatedData.error.flatten());
    // 에러 메시지를 좀 더 구체적으로 반환
    return {
      error:
        validatedData.error.flatten().fieldErrors.personalInfoConsent?.[0] ||
        "유효하지 않은 데이터입니다.",
    };
  }

  const { name, phoneNumber, gender, birthDate, school, personalInfoConsent } =
    validatedData.data;

  try {
    // [변경] 전화번호만으로 체크하던 것을 (이름 AND 전화번호)로 변경
    const [existingUser] = await db
      .select()
      .from(generalUsers)
      .where(
        and(
          eq(generalUsers.name, name),
          eq(generalUsers.phoneNumber, phoneNumber)
        )
      );

    // 이름과 전화번호가 모두 같은 경우에만 중복 에러
    if (existingUser) {
      return { error: "이미 해당 이름과 전화번호로 등록된 사용자가 있습니다." };
    }

    const [newUser] = await db
      .insert(generalUsers)
      .values({
        name,
        phoneNumber,
        gender,
        birthDate: birthDate || "",
        school: school || "",
        personalInfoConsent: personalInfoConsent,
      })
      .returning();

    return { success: true, user: { id: newUser.id, name: newUser.name } };
  } catch (error) {
    console.error("Error creating general user:", error);
    return { error: "사용자 등록 중 오류가 발생했습니다." };
  }
}

export async function getAllGeneralUsers({
  page = 1,
  per_page = 10,
  sort = "name",
  order = "asc",
  search = "",
}: {
  page?: number;
  per_page?: number;
  sort?: string;
  order?: string;
  search?: string;
}) {
  try {
    const offset = (page - 1) * per_page;

    let whereClause = undefined;

    if (search) {
      // 사용자가 입력한 검색어에서 하이픈 제거 (예: 010-1234 -> 0101234)
      // 만약 이름 검색인 경우(하이픈 없음)에는 그대로 유지됨
      const cleanSearch = search.replace(/-/g, "");

      // cleanSearch가 빈 문자열이면(검색어가 '-'만 있는 경우 등) 모든 전화번호가 검색되는 문제 방지
      if (cleanSearch.length > 0) {
        whereClause = or(
          // 1. 이름 검색 (기존 검색어 그대로 사용)
          like(generalUsers.name, `%${search}%`),

          // 2. 전화번호 검색 (DB값의 하이픈을 제거하고, 하이픈 없는 검색어와 비교)
          // SQLite의 REPLACE 함수 사용: phone_number의 '-'를 ''로 변경 후 비교
          sql`REPLACE(${
            generalUsers.phoneNumber
          }, '-', '') LIKE ${`%${cleanSearch}%`}`
        );
      } else {
        // 검색어가 특수문자로만 이루어져서 cleanSearch가 빈 값이 된 경우 이름만 검색
        whereClause = like(generalUsers.name, `%${search}%`);
      }
    }

    const [total] = await db
      .select({ value: count() })
      .from(generalUsers)
      .where(whereClause);
    const total_count = total.value;

    const orderDirection = order === "asc" ? asc : desc;
    let orderBy;

    switch (sort) {
      case "name":
        orderBy = orderDirection(generalUsers.name);
        break;
      case "age":
        orderBy = orderDirection(generalUsers.birthDate);
        break;
      case "createdAt":
        orderBy = orderDirection(generalUsers.id);
        break;
      default:
        orderBy = asc(generalUsers.name);
    }

    const allUsers = await db
      .select()
      .from(generalUsers)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(per_page)
      .offset(offset);

    return { data: allUsers, total_count };
  } catch (error) {
    console.error(error);
    return { error: "사용자 정보를 가져오는 데 실패했습니다." };
  }
}
export async function getAllAdminUsers() {
  try {
    const allUsers = await db.select().from(users);
    return { data: allUsers };
  } catch (error) {
    return { error: "관리자 정보를 가져오는 데 실패했습니다." };
  }
}
// 3. 사용자 수정 함수 수정
export async function updateUser(id: number, data: unknown) {
  const validatedData = generalUserSchema.safeParse(data);
  if (!validatedData.success) {
    console.error("Validation Error:", validatedData.error.flatten());
    return {
      error:
        validatedData.error.flatten().fieldErrors.personalInfoConsent?.[0] ||
        "유효하지 않은 데이터입니다.",
    };
  }

  const { name, phoneNumber, gender, birthDate, school, personalInfoConsent } =
    validatedData.data;

  try {
    // [변경] 다른 사용자가 같은 (이름 + 전화번호) 조합을 쓰고 있는지 확인
    const [existingUser] = await db
      .select()
      .from(generalUsers)
      .where(
        and(
          eq(generalUsers.name, name),
          eq(generalUsers.phoneNumber, phoneNumber)
        )
      );

    if (existingUser && existingUser.id !== id) {
      return {
        error: "이미 해당 이름과 전화번호를 사용하는 다른 사용자가 있습니다.",
      };
    }

    await db
      .update(generalUsers)
      .set({
        name,
        phoneNumber,
        gender,
        birthDate: birthDate || "",
        school: school || "",
        personalInfoConsent,
      })
      .where(eq(generalUsers.id, id));

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Error updating general user:", error);
    return { error: "사용자 정보 업데이트에 실패했습니다." };
  }
}

export async function updateGeneralUserForKiosk(
  id: number,
  data: Pick<
    typeof generalUsers.$inferInsert,
    "gender" | "birthDate" | "school" | "personalInfoConsent"
  >
) {
  const kioskUpdateSchema = generalUserSchema.pick({
    gender: true,
    birthDate: true,
    school: true,
    personalInfoConsent: true,
  });

  const validatedData = kioskUpdateSchema.safeParse(data);

  if (!validatedData.success) {
    return {
      error:
        validatedData.error.flatten().fieldErrors.personalInfoConsent?.[0] ||
        validatedData.error.flatten().fieldErrors.gender?.[0] ||
        validatedData.error.flatten().fieldErrors.birthDate?.[0] ||
        validatedData.error.flatten().fieldErrors.school?.[0] ||
        "유효하지 않은 데이터입니다.",
    };
  }

  try {
    const [existingUser] = await db
      .select()
      .from(generalUsers)
      .where(eq(generalUsers.id, id));

    if (!existingUser) {
      return { error: "사용자를 찾을 수 없습니다." };
    }

    await db
      .update(generalUsers)
      .set({
        gender: validatedData.data.gender,
        birthDate: validatedData.data.birthDate,
        school: validatedData.data.school,
        personalInfoConsent: validatedData.data.personalInfoConsent,
      })
      .where(eq(generalUsers.id, id));

    revalidatePath("/kiosk/dby");
    revalidatePath("/kiosk/smy");
    revalidatePath("/admin/users");

    return { success: true };
  } catch (error) {
    console.error("Error updating kiosk general user:", error);
    return { error: "사용자 정보 업데이트에 실패했습니다." };
  }
}

export async function deleteGeneralUser(id: number) {
  try {
    await db.delete(generalUsers).where(eq(generalUsers.id, id));
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    return { error: "사용자 삭제에 실패했습니다." };
  }
}

export async function deleteAdminUser(id: number) {
  try {
    await db.delete(users).where(eq(users.id, id));
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    return { error: "관리자 삭제에 실패했습니다." };
  }
}

export async function exportGeneralUsersToExcel() {
  try {
    const allUsers = await db.select().from(generalUsers);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("D.Base 사용자 정보");

    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "이름", key: "name", width: 20 },
      { header: "전화번호", key: "phoneNumber", width: 20 },
      { header: "성별", key: "gender", width: 10 },
      { header: "생년월일", key: "birthDate", width: 15 },
      { header: "교급", key: "schoolLevel", width: 12 },
      { header: "개인정보동의", key: "personalInfoConsent", width: 15 },
    ];

    // 헤더 스타일 적용
    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD3D3D3" }, // 회색
      };
      cell.font = {
        bold: true,
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
      };
    });

    // 모든 데이터 셀에 가운데 정렬 적용
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 0) {
        // 헤더 행 제외
        row.eachCell((cell) => {
          cell.alignment = {
            vertical: "middle",
            horizontal: "center",
          };
        });
      }
    });

    allUsers.forEach((user) => {
      worksheet.addRow({
        id: user.id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        gender: user.gender,
        birthDate: user.birthDate,
        schoolLevel: getSchoolLevel(user.school), // 교급
        personalInfoConsent: user.personalInfoConsent ? "Y" : "N",
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      success: true,
      buffer: Buffer.from(buffer).toString("base64"),
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  } catch (error) {
    console.error("Error exporting general users to Excel:", error);
    return { error: "사용자 정보를 엑셀로 내보내는 데 실패했습니다." };
  }
}

export async function getGeneralUserById(id: number) {
  try {
    const [user] = await db
      .select()
      .from(generalUsers)
      .where(eq(generalUsers.id, id));

    if (!user) {
      return { error: "사용자를 찾을 수 없습니다." };
    }
    return { success: true, data: user };
  } catch (error) {
    console.error("Error fetching general user by id:", error);
    return { error: "사용자 정보를 가져오는 데 실패했습니다." };
  }
}
