import { NextResponse } from "next/server";
import { getPhase } from "@/lib/phase";

export async function GET() {
  const { phase, endsAt } = await getPhase();
  return NextResponse.json({ phase, endsAt: endsAt ? endsAt.toISOString() : null });
}
