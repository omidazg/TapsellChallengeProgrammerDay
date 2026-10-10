import { NextResponse } from "next/server";
import { coverSvg, seedFromCoverName } from "@/lib/cover-art";

/** جلد پیش‌فرض/تصادفی ساخته‌شده روی خود سایت (src/lib/cover-art.ts) */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const seed = seedFromCoverName((await params).name);
  if (!seed) return new NextResponse(null, { status: 404 });
  return new NextResponse(coverSvg(seed), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
