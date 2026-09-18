import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ publicKey: getVapidPublicKey() }, { headers: { "Cache-Control": "no-store" } });
}
