import { NextResponse } from "next/server";
import { getPhase, PHASE_LABEL } from "@/lib/phase";
import { cached } from "@/lib/ttl-cache";

// این مسیر برای polling است؛ هیچ‌وقت نباید در مرورگر/پروکسی کش شود.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** کلید کش فاز؛ تغییر فاز می‌تواند با invalidate("api:phase") آن را فوراً باطل کند. */
const PHASE_KEY = "api:phase";

export async function GET() {
  // فقط خواندن فاز کش می‌شود (۲ ثانیه، دادهٔ عمومی)؛ serverNow همیشه تازه است.
  const { phase, endsAt } = await cached(PHASE_KEY, 2000, getPhase);
  return NextResponse.json(
    {
      phase,
      label: PHASE_LABEL[phase],
      endsAt: endsAt ? endsAt.toISOString() : null,
      // برای تصحیح اختلاف ساعت کلاینت نسبت به سرور (کلاک‌اسکیو) در PhaseCountdown.
      serverNow: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
