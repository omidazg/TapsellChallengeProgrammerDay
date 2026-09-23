import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getLastSchedulerTickAt } from "@/lib/scheduler";

/**
 * سلامت سرویس برای مانیتورینگ خارجی — بدون احراز هویت، هرگز نباید کش شود.
 * هیچ مقدار env یا رازی در پاسخ نمی‌آید؛ فقط latency/uptime/نسخه.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SCHEDULER_STALE_MS = 5 * 60_000; // بیش از این یعنی احتمالاً اسکجولر متوقف شده (تیک هر ۳۰ ثانیه است)

export async function GET() {
  const dbStart = Date.now();
  let dbMs: number | null = null;
  let dbOk = false;
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbMs = Date.now() - dbStart;
    dbOk = true;
  } catch {
    dbMs = null;
    dbOk = false;
  }

  const lastTickAt = getLastSchedulerTickAt();
  const schedulerAgeMs = lastTickAt != null ? Date.now() - lastTickAt : null;
  // اگر اسکجولر غیرفعال است (SCHEDULER_DISABLED=1) هنوز هیچ تیکی نداریم و این طبیعی است؛
  // فقط وقتی قبلاً تیک زده و حالا خیلی قدیمی شده، ناسالم در نظر می‌گیریم.
  const schedulerOk = process.env.SCHEDULER_DISABLED === "1" || lastTickAt == null || schedulerAgeMs! < SCHEDULER_STALE_MS;

  const ok = dbOk && schedulerOk;

  return NextResponse.json(
    {
      ok,
      db: { ok: dbOk, ms: dbMs },
      scheduler: { ok: schedulerOk, lastTickAgeMs: schedulerAgeMs, disabled: process.env.SCHEDULER_DISABLED === "1" },
      uptime: process.uptime(),
      version: process.env.GIT_SHA || "dev",
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
