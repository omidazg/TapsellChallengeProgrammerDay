import { NextResponse } from "next/server";
import { getTicker } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getTicker(20);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
