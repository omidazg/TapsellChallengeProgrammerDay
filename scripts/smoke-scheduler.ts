/**
 * دود-تست زمان‌بند خودکار (src/lib/scheduler.ts).
 * اجرا: npx tsx scripts/smoke-scheduler.ts
 *
 * مثل scripts/smoke-auction.ts، برای اینکه پایگاه دادهٔ اصلی دست‌نخورده بماند،
 * یک کپی از `dev.db` در پوشهٔ موقت ساخته می‌شود و `DATABASE_URL` پیش از بارگذاری
 * Prisma به آن اشاره می‌کند (معادل «db push --force-reset» روی یک پایگاه‌دادهٔ تازه،
 * بدون نیاز به زیرفرآیند جدا — اسکیمای dev.db از قبل به‌روز است).
 * در پایان فاز به REGISTRATION برمی‌گردد و کپی حذف می‌شود.
 */

import fs from "node:fs";
import { createTempDb } from "./lib/temp-db";

let TMP_DB = "";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

function eq(label: string, actual: unknown, expected: unknown) {
  check(label, Object.is(actual, expected), { actual, expected });
}

async function main() {
  // اسکیما از روی مایگریشن‌ها ساخته می‌شود، نه با کپی از dev.db: روی CI
  // اصلاً dev.db وجود ندارد. createTempDb خودش DATABASE_URL را هم تنظیم می‌کند
  // (باید پیش از import شدن prisma باشد).
  TMP_DB = createTempDb("smoke-scheduler").file;
  // این اسکریپت خودش زمان‌بند پس‌زمینه را اجرا نمی‌کند؛ فقط runScheduledTasks را مستقیم صدا می‌زند.
  process.env.SCHEDULER_DISABLED = "1";

  // پس از تنظیم DATABASE_URL بارگذاری می‌شوند (Prisma آدرس را در زمان import می‌خواند).
  const { setPhase, getPhase } = await import("../src/lib/phase");
  const { setSetting } = await import("../src/lib/admin");
  const { runScheduledTasks } = await import("../src/lib/scheduler");

  try {
    // ---------- حالت ۱: auto_advance=1 و زمان فاز گذشته ----------
    const pastEndsAt = new Date(Date.now() - 60_000);
    await setPhase("IDEATION", pastEndsAt);
    await setSetting("auto_advance", "1");

    await runScheduledTasks();

    const after1 = await getPhase();
    eq("auto_advance=1: فاز به SEED_ROUND رفت", after1.phase, "SEED_ROUND");
    check(
      "auto_advance=1: زمان پایان جدید تقریباً ۲۴ ساعت بعد است",
      !!after1.endsAt && Math.abs(after1.endsAt.getTime() - (Date.now() + 24 * 3600 * 1000)) < 10_000,
      after1.endsAt?.toISOString()
    );

    // اجرای دوباره بدون گذشتن زمان فاز جدید: تغییری نباید رخ دهد (idempotent/safe)
    const endsAtAfterFirst = after1.endsAt?.toISOString() ?? null;
    await runScheduledTasks();
    const after1b = await getPhase();
    eq("اجرای دوباره بدون پایان زمان فاز: فاز تغییر نکرد", after1b.phase, "SEED_ROUND");
    eq("اجرای دوباره بدون پایان زمان فاز: زمان پایان تغییر نکرد", after1b.endsAt?.toISOString() ?? null, endsAtAfterFirst);

    // ---------- حالت ۲: auto_advance=0 ----------
    const pastEndsAt2 = new Date(Date.now() - 60_000);
    await setPhase("SEED_ROUND", pastEndsAt2);
    await setSetting("auto_advance", "0");

    await runScheduledTasks();

    const after2 = await getPhase();
    eq("auto_advance=0: فاز تغییر نکرد", after2.phase, "SEED_ROUND");
    eq("auto_advance=0: زمان پایان تغییر نکرد", after2.endsAt?.toISOString(), pastEndsAt2.toISOString());

    // ---------- حالت ۳: فاز CLOSED هرگز پیشروی نمی‌کند، حتی با auto_advance=1 ----------
    await setPhase("CLOSED", new Date(Date.now() - 60_000));
    await setSetting("auto_advance", "1");
    await runScheduledTasks();
    const after3 = await getPhase();
    eq("CLOSED: فاز تغییر نکرد", after3.phase, "CLOSED");

    // ---------- حالت ۴: اجرای هم‌زمان نباید رو هم بیفتد (قفل در-فرآیندی) ----------
    await setPhase("IDEATION", new Date(Date.now() - 60_000));
    await setSetting("auto_advance", "1");
    await Promise.all([runScheduledTasks(), runScheduledTasks(), runScheduledTasks()]);
    const after4 = await getPhase();
    eq("اجرای هم‌زمان: فقط یک‌بار پیشروی کرد", after4.phase, "SEED_ROUND");
  } finally {
    // ---------- پاکسازی ----------
    try {
      const { setPhase } = await import("../src/lib/phase");
      await setPhase("REGISTRATION", null);
      const { prisma } = await import("../src/lib/db");
      await prisma.$disconnect();
    } catch {
      /* پاکسازی بهترین‌تلاش */
    }
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      try {
        fs.rmSync(TMP_DB + suffix, { force: true });
      } catch {
        /* نادیده */
      }
    }
  }

  console.log("");
  console.log(`نتیجه: ${passed} PASS · ${failed} FAIL`);
  console.log(failed === 0 ? "SMOKE: PASS" : "SMOKE: FAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE: FAIL — خطای غیرمنتظره");
  console.error(e);
  process.exit(1);
});
