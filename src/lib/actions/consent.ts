// lib/actions/consent.ts
"use server";

import fs from "fs/promises";
import path from "path";

export async function getConsentFile() {
  try {
    const consentDir = path.join(process.cwd(), "public/uploads/consent");
    const files = await fs.readdir(consentDir);

    if (files.length > 0) {
      const fileName = files[0];
      const ext = fileName.toLowerCase().split(".").pop();

      let fileType: "pdf" | "image" | "doc" = "doc";
      if (ext === "pdf") fileType = "pdf";
      else if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext || ""))
        fileType = "image";

      return {
        url: `/uploads/consent/${fileName}`,
        type: fileType,
      };
    }
    return null;
  } catch (error) {
    // 약관 디렉터리가 아직 없는 경우(미등록)는 정상 상태이므로 조용히 무시
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    console.error("Error fetching consent file:", error);
    return null;
  }
}
