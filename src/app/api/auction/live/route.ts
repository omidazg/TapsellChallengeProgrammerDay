import { NextResponse } from "next/server";
import { getLiveAuctionIdCached } from "@/lib/auction";

export const dynamic = "force-dynamic";

export async function GET() {
  // کش مشترک ~۱ ثانیه‌ای (دادهٔ عمومی)؛ با هر تغییر حراج باطل می‌شود.
  const id = await getLiveAuctionIdCached();
  return NextResponse.json({ id }, { headers: { "Cache-Control": "no-store" } });
}
