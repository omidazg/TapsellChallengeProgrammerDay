import { NextResponse } from "next/server";
import { currentOrNextAuctionId } from "@/lib/auction";

export const dynamic = "force-dynamic";

export async function GET() {
  const id = await currentOrNextAuctionId();
  return NextResponse.json({ id }, { headers: { "Cache-Control": "no-store" } });
}
