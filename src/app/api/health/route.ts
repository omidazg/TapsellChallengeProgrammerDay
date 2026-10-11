import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getLastSchedulerTickAt } from "@/lib/scheduler";

/**
 * سلامت سرویس برای مانیتورینگ خارجی — بدون احراز هویت، هرگز نباید کش شود.
 * هیچ مقدار env یا رازی در پاسخ نمی‌آید؛ فقط latency/uptime/نسخه.
 *
 * - بدون پارامتر: سلامت کامل (دیتابیس + اسکجولر). healthcheck داکر و deploy/uptime-check.sh.
 * - `?probe=db`: فقط دیتابیس. health_uri در Caddyfile از این استفاده می‌کند تا اسکجولرِ
 *   کند/متوقف باعث نشود Caddy تنها upstream را ناسالم بداند و کل سایت ۵۰۳ شود.
 * - `version` همان GIT_SHA است که Dockerfile از build-arg در ایمیج می‌گذارد.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SCHEDULER_STALE_MS = 5 * 60_000; // بیش از این یعنی احتمالاً اسکجولر متوقف شده (تیک هر ۳۰ ثانیه است)

// req اختیاری است چون scripts/smoke-health.ts همین تابع را مستقیم و بدون آرگومان صدا می‌زند.
export async function GET(req?: Request) {
  const dbOnly = req ? new URL(req.url).searchParams.get("probe") === "db" : false;
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

  if (dbOnly) {
    return NextResponse.json(
      { ok: dbOk, db: { ok: dbOk, ms: dbMs } },
      { status: dbOk ? 200 : 503, headers: { "Cache-Control": "no-store" } }
    );
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
