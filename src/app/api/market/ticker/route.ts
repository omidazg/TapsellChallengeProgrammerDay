import { NextResponse } from "next/server";
import { getTicker } from "@/lib/market";
import { cached } from "@/lib/ttl-cache";

export const dynamic = "force-dynamic";

/** کلید کش نوار فروش؛ نوشتن‌های بازار می‌توانند با invalidate("api:market:ticker") آن را باطل کنند. */
const TICKER_KEY = "api:market:ticker";

export async function GET() {
  // دادهٔ عمومی است (برای همه یکسان)؛ کش مشترک ۲ ثانیه‌ای.
  const data = await cached(TICKER_KEY, 2000, () => getTicker(20));
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
