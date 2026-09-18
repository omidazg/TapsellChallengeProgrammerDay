/**
 * دود-تست بهینه‌سازی‌های کارایی: کش امتیازها (src/lib/scoring.ts)، getMarketProducts
 * (src/lib/market.ts) و پاک‌سازی اعلان‌های قدیمی (src/lib/scheduler.ts).
 * اجرا: npx tsx scripts/smoke-perf.ts
 *
 * مثل scripts/smoke-scheduler.ts، یک کپی از `dev.db` در پوشهٔ موقت ساخته می‌شود و
 * `DATABASE_URL` پیش از بارگذاری Prisma به آن اشاره می‌کند تا پایگاه‌دادهٔ اصلی
 * دست‌نخورده بماند. در پایان کپی حذف می‌شود.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DB = path.join(ROOT, "dev.db");
const TMP_DB = path.join(os.tmpdir(), `arena-smoke-perf-${process.pid}.db`);

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
  if (!fs.existsSync(SOURCE_DB)) {
    console.log("FAIL  dev.db پیدا نشد؛ ابتدا `npx prisma db push` را اجرا کنید.");
    process.exit(1);
  }
  fs.copyFileSync(SOURCE_DB, TMP_DB);
  process.env.DATABASE_URL = `file:${TMP_DB}`;
  process.env.SCHEDULER_DISABLED = "1";

  // پس از تنظیم DATABASE_URL بارگذاری می‌شوند (Prisma آدرس را در زمان import می‌خواند).
  const { prisma } = await import("../src/lib/db");
  const { computeScores, computeScoresCached } = await import("../src/lib/scoring");
  const { invalidate } = await import("../src/lib/ttl-cache");
  const { getMarketProducts } = await import("../src/lib/market");
  const { cleanupOldNotifications } = await import("../src/lib/scheduler");

  try {
    // ---------- ۱. computeScoresCached باید همان نتیجهٔ computeScores را بدهد ----------
    invalidate("scores:");
    const fresh = await computeScores();
    const cachedFirst = await computeScoresCached();
    check(
      "computeScoresCached همان مقدار computeScores را برمی‌گرداند",
      JSON.stringify(fresh) === JSON.stringify(cachedFirst),
      { fresh, cachedFirst }
    );

    // ---------- ۲. کش در بازهٔ TTL هیت می‌خورد (بدون بازمحاسبه) ----------
    const cachedSecond = await computeScoresCached();
    check(
      "دو فراخوانی پیاپی computeScoresCached همان Promise/شیٔ کش‌شده را برمی‌گردانند (هیت کش)",
      cachedFirst === cachedSecond
    );

    // ---------- ۳.الف: invalidate کش را پاک می‌کند و بازمحاسبه رخ می‌دهد ----------
    invalidate("scores:");
    const cachedThird = await computeScoresCached();
    check(
      "پس از invalidate، computeScoresCached شیٔ تازه‌ای برمی‌گرداند (نه رفرنس کش قبلی)",
      cachedThird !== cachedFirst
    );
    check(
      "مقدار بازمحاسبه‌شده (بدون تغییر داده) با computeScores خام یکی است",
      JSON.stringify(cachedThird) === JSON.stringify(fresh)
    );

    // ---------- ۳.ب: invalidate باید دادهٔ واقعاً تازه را هم منعکس کند ----------
    const staleTeamCount = cachedThird.teams.length;
    const newTeam = await prisma.team.create({
      data: { name: "تیم دود-پرف کش", slug: `smoke-perf-cache-team-${process.pid}` },
    });
    // بدون invalidate، کش هنوز باید تیم جدید را نبیند (در بازهٔ TTL است)
    const stillCached = await computeScoresCached();
    eq("پیش از invalidate: تیم تازه هنوز در کش نیست", stillCached.teams.length, staleTeamCount);
    invalidate("scores:");
    const afterInvalidate = await computeScoresCached();
    eq(
      "پس از invalidate: تیم تازه در نتیجهٔ کش‌شده دیده می‌شود",
      afterInvalidate.teams.length,
      staleTeamCount + 1
    );
    check(
      "تیم تازه در خروجی کش‌شده حضور دارد",
      afterInvalidate.teams.some((t) => t.teamId === newTeam.id)
    );

    // ---------- ۴. getMarketProducts: sold/limitReached با کوئری خام یکی باشد ----------
    const team = await prisma.team.create({ data: { name: "تیم دود-پرف", slug: `smoke-perf-team-${process.pid}` } });
    const product = await prisma.product.create({
      data: { teamId: team.id, name: "محصول دود-پرف", price: 20, submittedAt: new Date() },
    });
    const buyer1 = await prisma.user.create({
      data: {
        email: `perf-buyer1-${process.pid}@example.test`,
        passwordHash: "x",
        nickname: "خریدار یک",
        role: "DEALMAKER",
        power: "HYPE",
      },
    });
    const buyer2 = await prisma.user.create({
      data: {
        email: `perf-buyer2-${process.pid}@example.test`,
        passwordHash: "x",
        nickname: "خریدار دو",
        role: "DEALMAKER",
        power: "HYPE",
      },
    });
    await prisma.purchase.createMany({
      data: [
        { productId: product.id, userId: buyer1.id, amount: 20 },
        { productId: product.id, userId: buyer1.id, amount: 15 },
        { productId: product.id, userId: buyer2.id, amount: 10 },
      ],
    });

    const maxPerTarget = 30;
    const cards = await getMarketProducts("all", { userId: buyer1.id, maxPerTarget });
    const card = cards.find((c) => c.id === product.id);

    const rawSoldAgg = await prisma.purchase.aggregate({ where: { productId: product.id }, _sum: { amount: true } });
    const expectedSold = rawSoldAgg._sum.amount ?? 0;
    const rawViewerAgg = await prisma.purchase.aggregate({
      where: { productId: product.id, userId: buyer1.id },
      _sum: { amount: true },
    });
    const expectedViewerSpent = rawViewerAgg._sum.amount ?? 0;
    const expectedLimitReached = expectedViewerSpent >= maxPerTarget;

    check("getMarketProducts محصول را برمی‌گرداند", !!card);
    eq("getMarketProducts: sold با کوئری خام یکی است", card?.sold, expectedSold);
    eq("getMarketProducts: limitReached با محاسبهٔ خام یکی است", card?.limitReached, expectedLimitReached);

    // ---------- ۵. پاک‌سازی اعلان‌های قدیمی ----------
    const notifUser = await prisma.user.create({
      data: {
        email: `perf-notif-user-${process.pid}@example.test`,
        passwordHash: "x",
        nickname: "کاربر اعلان",
        role: "DEALMAKER",
        power: "HYPE",
      },
    });
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    const rows = [
      { key: "readNew", readAt: new Date(now - 1 * day), createdAt: new Date(now - 1 * day), keep: true },
      { key: "readOld8d", readAt: new Date(now - 8 * day), createdAt: new Date(now - 10 * day), keep: false },
      { key: "unreadOld10d", readAt: null, createdAt: new Date(now - 10 * day), keep: true },
      { key: "unreadVeryOld31d", readAt: null, createdAt: new Date(now - 31 * day), keep: false },
      { key: "readVeryOld32d", readAt: new Date(now - 32 * day), createdAt: new Date(now - 32 * day), keep: false },
    ] as const;

    for (const r of rows) {
      await prisma.notification.create({
        data: {
          userId: notifUser.id,
          kind: r.key,
          title: r.key,
          readAt: r.readAt,
          createdAt: r.createdAt,
        },
      });
    }

    // اولین فراخوانی در این فرایند همیشه اجرا می‌شود (قفل درون‌حافظه‌ای تازه است، آخرین اجرا صفر است).
    await cleanupOldNotifications();

    const remaining = await prisma.notification.findMany({ where: { userId: notifUser.id } });
    const remainingKinds = new Set(remaining.map((n) => n.kind));
    const expectedKept = rows.filter((r) => r.keep).map((r) => r.key);
    const expectedDeleted = rows.filter((r) => !r.keep).map((r) => r.key);

    check(
      "پاک‌سازی اعلان‌ها: فقط ردیف‌های موردانتظار نگه داشته شدند",
      expectedKept.every((k) => remainingKinds.has(k)) && expectedDeleted.every((k) => !remainingKinds.has(k)),
      { remainingKinds: [...remainingKinds], expectedKept, expectedDeleted }
    );

    // ---------- ۶. قفل «حداکثر یک‌بار در ساعت» ----------
    await prisma.notification.create({
      data: {
        userId: notifUser.id,
        kind: "unreadVeryOld31d-again",
        title: "x",
        readAt: null,
        createdAt: new Date(now - 40 * day),
      },
    });
    await cleanupOldNotifications(); // باید بی‌اثر باشد چون کمتر از یک ساعت از اجرای قبلی گذشته
    const stillThere = await prisma.notification.findFirst({ where: { kind: "unreadVeryOld31d-again" } });
    check("پاک‌سازی دوباره در همان ساعت اجرا نشد (قفل درون‌حافظه‌ای)", !!stillThere);
  } catch (err) {
    console.error(err);
    check("اجرای بدون خطا", false, String(err));
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      /* نادیده */
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
