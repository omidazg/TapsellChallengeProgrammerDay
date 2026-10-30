/**
 * دود-تست زمان‌بند خودکار (src/lib/scheduler.ts).
 * اجرا: npx tsx scripts/smoke-scheduler.ts
 *
 * مثل scripts/smoke-auction.ts، برای اینکه پایگاه دادهٔ اصلی دست‌نخورده بماند،
 * یک کپی از `dev.db` در پوشهٔ موقت ساخته می‌شود و `DATABASE_URL` پیش از بارگذاری
 * Prisma به آن اشاره می‌کند (معادل «db push --force-reset» روی یک پایگاه‌دادهٔ تازه،
 * بدون نیاز به زیرفرآیند جدا — اسکیمای dev.db از قبل به‌روز است).
 * در پایان کپی حذف می‌شود.
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
  const { setModuleStatus } = await import("../src/lib/module-state");
  const { runScheduledTasks, getLastSchedulerTickAt } = await import("../src/lib/scheduler");
  const { prisma } = await import("../src/lib/db");

  try {
    // ---------- حالت ۱: ددلاین نهایی نرسیده ----------
    const future = new Date(Date.now() + 3600_000);
    await setPhase("LIVE", future);
    await runScheduledTasks();
    const after1 = await getPhase();
    eq("پیش از ددلاین: مسابقه در جریان می‌ماند", after1.phase, "LIVE");
    eq("پیش از ددلاین: ددلاین تغییر نکرد", after1.endsAt?.toISOString(), future.toISOString());
    check("تیک موفق ثبت شد", typeof getLastSchedulerTickAt() === "number");

    // ---------- حالت ۲: بدون ددلاین هرگز خودکار بسته نمی‌شود ----------
    await setPhase("LIVE", null);
    await runScheduledTasks();
    eq("بدون ددلاین: مسابقه در جریان می‌ماند", (await getPhase()).phase, "LIVE");

    // ---------- حالت ۳: با رسیدن ددلاین مسابقه خودکار بسته و تسویه می‌شود ----------
    const past = new Date(Date.now() - 60_000);
    await setPhase("LIVE", past);
    await runScheduledTasks();
    eq("پس از ددلاین: مسابقه بسته شد", (await getPhase()).phase, "CLOSED");
    const settledAt = await prisma.setting.findUnique({ where: { key: "settled_at" } });
    check("پس از ددلاین: تسویه انجام شد", !!settledAt?.value, settledAt);
    eq("پس از ددلاین: ردیف پایان مسابقه برای فید عمومی ثبت شد", await prisma.auditLog.count({ where: { action: "contest.end" } }), 1);

    // ---------- حالت ۴: اجرای دوباره روی CLOSED کاری نمی‌کند ----------
    await runScheduledTasks();
    eq("CLOSED: وضعیت تغییر نکرد", (await getPhase()).phase, "CLOSED");
    const settledAgain = await prisma.setting.findUnique({ where: { key: "settled_at" } });
    eq("CLOSED: تسویه دوباره اجرا نشد", settledAgain?.value, settledAt?.value);

    // ---------- حالت ۵: حراج خودکار فقط وقتی بخش بازار باز است ----------
    await setPhase("LIVE", null);
    await prisma.setting.deleteMany({ where: { key: "last_auction_ended_at" } });
    const team = await prisma.team.create({ data: { name: "تیم زمان‌بند", slug: "smoke-scheduler-team" } });
    const product = await prisma.product.create({
      data: { teamId: team.id, slug: "smoke-scheduler-team-general", name: "محصول زمان‌بند", price: 10, submittedAt: new Date() },
    });
    await prisma.auction.create({ data: { productId: product.id, status: "SCHEDULED", startPrice: 5 } });

    await setModuleStatus("market", "closed");
    await runScheduledTasks();
    eq("بازار بسته: حراج شروع نشد", await prisma.auction.count({ where: { status: "LIVE" } }), 0);

    await setModuleStatus("market", "open");
    await setSetting("auto_auction", "0");
    await runScheduledTasks();
    eq("auto_auction=0: حراج شروع نشد", await prisma.auction.count({ where: { status: "LIVE" } }), 0);

    await setSetting("auto_auction", "1");
    await runScheduledTasks();
    eq("بازار باز و auto_auction=1: حراج صف شروع شد", await prisma.auction.count({ where: { status: "LIVE" } }), 1);

    // ---------- حالت ۶: اجرای هم‌زمان نباید رو هم بیفتد (قفل در-فرآیندی) ----------
    await setPhase("LIVE", new Date(Date.now() - 60_000));
    await Promise.all([runScheduledTasks(), runScheduledTasks(), runScheduledTasks()]);
    eq("اجرای هم‌زمان: مسابقه یک‌بار بسته شد", (await getPhase()).phase, "CLOSED");
  } finally {
    // ---------- پاکسازی ----------
    try {
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
