import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getSiteConfig, updateSiteConfigMedia } from "@/lib/actions/siteConfig";

const uploadDir = path.join(process.cwd(), "public/uploads/background");
const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".mp4",
  ".webm",
]);

function sanitizeFileName(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, ext).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${Date.now()}-${base || "background"}${ext}`;
}

function getMediaType(fileName: string): "image" | "video" {
  const ext = path.extname(fileName).toLowerCase();
  return ext === ".mp4" || ext === ".webm" ? "video" : "image";
}

async function removeCurrentFile(filePath: string | null) {
  if (!filePath) {
    return;
  }

  const absolutePath = path.join(process.cwd(), "public", filePath);
  await fs.unlink(absolutePath).catch(() => undefined);
}

async function clearUploadDir() {
  await fs.mkdir(uploadDir, { recursive: true });
  const files = await fs.readdir(uploadDir).catch(() => []);

  await Promise.all(
    files.map((file) => fs.unlink(path.join(uploadDir, file)).catch(() => undefined))
  );
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { success: false, error: "업로드할 파일이 없습니다." },
        { status: 400 }
      );
    }

    const extension = path.extname(file.name).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      return NextResponse.json(
        { success: false, error: "지원하지 않는 파일 형식입니다." },
        { status: 400 }
      );
    }

    const currentConfig = await getSiteConfig();
    await removeCurrentFile(currentConfig.backgroundPath);
    await clearUploadDir();

    const filename = sanitizeFileName(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const nextPath = path.join(uploadDir, filename);

    await fs.writeFile(nextPath, buffer);
    await updateSiteConfigMedia({
      backgroundPath: `/uploads/background/${filename}`,
      backgroundType: getMediaType(file.name),
    });

    return NextResponse.json({
      success: true,
      path: `/uploads/background/${filename}`,
      type: getMediaType(file.name),
    });
  } catch (error) {
    console.error("Background upload failed:", error);
    return NextResponse.json(
      { success: false, error: "배경 업로드에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const currentConfig = await getSiteConfig();

    await removeCurrentFile(currentConfig.backgroundPath);
    await clearUploadDir();
    await updateSiteConfigMedia({
      backgroundPath: null,
      backgroundType: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Background delete failed:", error);
    return NextResponse.json(
      { success: false, error: "배경 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
