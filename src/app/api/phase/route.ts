import { NextResponse } from "next/server";
import { getPhase, PHASE_LABEL } from "@/lib/phase";

// این مسیر برای polling است؛ هیچ‌وقت نباید کش شود.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { phase, endsAt } = await getPhase();
  return NextResponse.json(
    { phase, label: PHASE_LABEL[phase], endsAt: endsAt ? endsAt.toISOString() : null },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
