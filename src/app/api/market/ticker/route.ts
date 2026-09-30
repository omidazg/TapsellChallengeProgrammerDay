import { NextResponse } from "next/server";
import { getTicker } from "@/lib/market";
import { cached } from "@/lib/ttl-cache";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** کلید کش نوار فروش؛ نوشتن‌های بازار می‌توانند با invalidate("api:market:ticker") آن را باطل کنند. */
const TICKER_KEY = "api:market:ticker";

export async function GET() {
  // نام خریداران فقط برای کاربران واردشده؛ بررسی فقط توکن کوکی است (بدون کوئری DB) چون هر ۳ ثانیه poll می‌شود.
  if (!(await getSessionUserId())) {
    return NextResponse.json({ error: "وارد نشده‌ای" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  // دادهٔ عمومی است (برای همه یکسان)؛ کش مشترک ۲ ثانیه‌ای.
  const data = await cached(TICKER_KEY, 2000, () => getTicker(20));
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
