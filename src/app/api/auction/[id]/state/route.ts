import { NextResponse } from "next/server";
import { getPublicAuctionState } from "@/lib/auction";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // فقط دادهٔ عمومی حراج، با کش مشترک ~۱ ثانیه‌ای؛ تسویهٔ حراج‌های تمام‌شده هم داخل همین تابع است.
  const state = await getPublicAuctionState(id);
  if (!state) {
    return NextResponse.json({ error: "حراج پیدا نشد" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
