import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveImage, UploadError } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;

// نمونهٔ سرور تک‌پردازه‌ای است؛ محدودیت نرخ در حافظه کافی است (شبیه ttl-cache.ts).
type RateGlobal = typeof globalThis & { __arenaUploadHits?: Map<string, number[]> };
const g = globalThis as RateGlobal;
const hits: Map<string, number[]> = (g.__arenaUploadHits ??= new Map());

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "وارد نشده‌ای" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  if (isRateLimited(user.id)) {
    return NextResponse.json(
      { error: "تعداد آپلودهای اخیر زیاد است؛ کمی صبر کن و دوباره تلاش کن" },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "فایلی ارسال نشده است" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { url, thumb } = await saveImage(file, user.id);
    return NextResponse.json({ url, thumb }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof UploadError ? e.message : "آپلود با خطا مواجه شد";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
