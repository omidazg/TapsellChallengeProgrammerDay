import { NextResponse } from "next/server";
import { getAuctionState, settleIfEnded } from "@/lib/auction";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await settleIfEnded(id).catch(() => null);
  const state = await getAuctionState(id);
  if (!state) {
    return NextResponse.json({ error: "حراج پیدا نشد" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
