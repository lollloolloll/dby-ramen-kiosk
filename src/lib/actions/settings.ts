"use server";
import { db } from "@/lib/db";
import { kioskSettings, generalUsers } from "@drizzle/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

async function ensureSettingsRow() {
  const [row] = await db
    .select()
    .from(kioskSettings)
    .where(eq(kioskSettings.id, 1));
  if (row) return row;
  const [created] = await db
    .insert(kioskSettings)
    .values({ id: 1, schoolReconfirmMode: false })
    .returning();
  return created;
}

export async function getKioskSettings() {
  const row = await ensureSettingsRow();
  return { schoolReconfirmMode: row.schoolReconfirmMode };
}
export async function setSchoolReconfirmMode(enabled: boolean) {
  try {
    await ensureSettingsRow();
    await db
      .update(kioskSettings)
      .set({ schoolReconfirmMode: enabled })
      .where(eq(kioskSettings.id, 1));
    if (enabled) {
      await db.update(generalUsers).set({ schoolConfirmed: false });
    }
    revalidatePath("/admin/settings");
    revalidatePath("/kiosk");
    return { success: true };
  } catch (error) {
    console.error("Error setting schoolreconfirm mode:", error);
    return { error: "설정 변경에 실패했습니다." };
  }
}
export async function confirmUserSchool(userId: number) {
  try {
    await db
      .update(generalUsers)
      .set({ schoolConfirmed: true })
      .where(eq(generalUsers.id, userId));
    return { success: true };
  } catch (error) {
    console.error("Error confirming user school:", error);
    return { error: "학교 확인에 실패했습니다." };
  }
}
export async function updateUserSchool(userId: number, school: string) {
  try {
    await db
      .update(generalUsers)
      .set({ school, schoolConfirmed: true })
      .where(eq(generalUsers.id, userId));
    return { success: true };
  } catch (error) {
    console.error("Error updating user school:", error);
    return { error: "학교 정보 수정에 실패했습니다." };
  }
}
