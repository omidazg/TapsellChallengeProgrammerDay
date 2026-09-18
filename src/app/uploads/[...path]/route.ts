import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isValidUploadName, UPLOAD_DIR } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/** پخش امن فایل‌های آپلودشده؛ فقط نام‌های محتوامحور معتبر پذیرفته می‌شوند. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;

  if (!segments || segments.length !== 1 || !isValidUploadName(segments[0])) {
    return new NextResponse(null, { status: 404 });
  }

  const uploadDir = path.resolve(UPLOAD_DIR);
  const filePath = path.resolve(uploadDir, segments[0]);
  // دفاع دوم در برابر traversal: مسیر نهایی باید دقیقاً داخل پوشهٔ آپلود بماند.
  if (path.dirname(filePath) !== uploadDir) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new NextResponse(null, { status: 404 });
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const data = await readFile(filePath);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
