/**
 * دود-تست تسویهٔ نهایی.
 * اجرا: npx tsx scripts/smoke-settlement.ts
 *
 * روی یک پایگاه‌دادهٔ SQLite موقت (createTempDb در scripts/lib/temp-db.ts) کار می‌کند؛ پایگاه‌دادهٔ
 * اصلی لمس نمی‌شود.
 *
 * سناریو: ۳ تیم (سه‌نفره، دونفره و شرکت فردی) + حامیان بی‌تیم. حمایت از ایده‌ها از مسیر واقعی
 * investCore در «دور حمایت» و خرید محصول از مسیر واقعی purchaseProduct در «روز بازار».
 * سپس پایان بازی با transitionTo("CLOSED") که تسویه را اجرا می‌کند، و settleGame دوباره
 * (idempotent). در پایان TeamScore ذخیره‌شده با computeScores و loadSettledOutput مقایسه می‌شود.
 */

import { createTempDb, isTempDatabaseUrl } from "./lib/temp-db";
import { createRequire } from "node:module";
import path from "node:path";

// `src/lib/db` پکیج `server-only` را import می‌کند که بیرون از Next خطا می‌دهد.
const nodeRequire = createRequire(__filename);
try {
  const id = nodeRequire.resolve("server-only");
  nodeRequire.cache[id] = {
    id,
    filename: id,
    path: path.dirname(id),
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  } as unknown as NodeJS.Module;
} catch {
  // نصب نیست؛ کاری لازم نیست
}

// DATABASE_URL باید پیش از import شدن src/lib/db تنظیم شود؛ اگر از قبل به یک
// پایگاه‌دادهٔ موقت اشاره می‌کند (اجرا از run-smokes) همان استفاده می‌شود.
const ownTempDb = isTempDatabaseUrl(process.env.DATABASE_URL) ? null : createTempDb("settlement");

const checks: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}
const near = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < 1e-6;

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { investCore } = await import("../src/lib/invest");
  const { purchaseProduct } = await import("../src/lib/market");
  const { computeScores } = await import("../src/lib/scoring");
  const { settleGame, getSettledAt, loadSettledOutput, SETTLED_AT_KEY } = await import("../src/lib/settlement");
  const { setPhase, getPhase } = await import("../src/lib/phase");
  const { transitionTo } = await import("../src/lib/phase-transition");

  try {
    // ---------- تیم‌ها، کاربران، ایده‌ها و محصولات ----------
    const SPEC = [
      { key: "alpha", name: "تیم آلفا", members: 3, solo: false, jury: [9, 9, 8] as const, ai: 70, price: 20 },
      { key: "beta", name: "تیم بتا", members: 2, solo: false, jury: [7, 8, 7] as const, ai: 90, price: 15 },
      { key: "gamma", name: "شرکت فردی گاما", members: 1, solo: true, jury: [8, 8, 8] as const, ai: null, price: 10 },
    ];
    const teamIds: Record<string, string> = {};
    const ideaIds: Record<string, string> = {};
    const productIds: Record<string, string> = {};
    const memberIds: Record<string, string[]> = {};

    let n = 0;
    const mkUser = (key: string, teamId: string | null) =>
      prisma.user.create({
        data: {
          email: `settle-${key}-${n++}@example.test`,
          passwordHash: "x",
          nickname: `کاربر ${key}`,
          role: "DEALMAKER",
          power: "",
          teamId,
          seedWallet: 0,
          buyWallet: 200,
        },
      });

    for (const t of SPEC) {
      const team = await prisma.team.create({ data: { name: t.name, slug: `smoke-${t.key}`, solo: t.solo } });
      teamIds[t.key] = team.id;
      memberIds[t.key] = [];
      for (let i = 0; i < t.members; i++) memberIds[t.key].push((await mkUser(`${t.key}${i}`, team.id)).id);
      const idea = await prisma.idea.create({
        data: {
          teamId: team.id,
          title: `ایدهٔ ${t.name}`,
          oneLiner: "یک خطی",
          problem: "مسئله",
          audience: "مخاطب",
          buildPlan: "برنامه",
          fundingCap: 0,
          revenueShare: 0,
          submittedAt: new Date(),
        },
      });
      ideaIds[t.key] = idea.id;
      const product = await prisma.product.create({
        data: {
          teamId: team.id,
          name: `محصول ${t.name}`,
          price: t.price,
          submittedAt: new Date(),
          juryWorks: t.jury[0],
          juryValue: t.jury[1],
          juryPitch: t.jury[2],
          aiQuality: t.ai,
        },
      });
      productIds[t.key] = product.id;
    }
    const fans = await Promise.all([0, 1, 2, 3].map((i) => mkUser(`fan${i}`, null)));

    // ---------- دور حمایت: investCore ----------
    await setPhase("SEED_ROUND", null);
    const inv = async (userId: string, key: string, amount: number) => {
      const r = await investCore(prisma, userId, ideaIds[key], amount);
      if (!r.ok) throw new Error(`حمایت ناموفق: ${r.error}`);
      return r;
    };
    await inv(fans[0].id, "alpha", 30);
    await inv(fans[1].id, "alpha", 10);
    await inv(fans[2].id, "beta", 25);
    await inv(fans[3].id, "gamma", 40);
    await inv(memberIds.beta[0], "alpha", 5); // حمایت بین‌تیمی
    const ownTeam = await investCore(prisma, memberIds.alpha[0], ideaIds.alpha, 5);
    check("حمایت از ایدهٔ تیم خود رد شد", !ownTeam.ok, ownTeam.ok ? "پذیرفته شد" : ownTeam.error);

    // ---------- روز بازار: purchaseProduct ----------
    await setPhase("MARKET", null);
    const buy = async (userId: string, key: string) => {
      const r = await purchaseProduct(userId, productIds[key]);
      if (!r.ok) throw new Error(`خرید ناموفق: ${r.error}`);
      return r;
    };
    await buy(fans[0].id, "beta");
    await buy(fans[1].id, "beta");
    await buy(fans[2].id, "gamma");
    await buy(fans[2].id, "gamma"); // خرید تکراری مجاز است
    await buy(memberIds.gamma[0], "alpha");
    const ownBuy = await purchaseProduct(memberIds.beta[1], productIds.beta);
    check("خرید از محصول تیم خود رد شد", !ownBuy.ok, ownBuy.ok ? "پذیرفته شد" : ownBuy.error);

    const fan0 = await prisma.user.findUniqueOrThrow({ where: { id: fans[0].id } });
    check("کیف حامی پس از حمایت و خرید درست کم شد (۲۰۰ − ۳۰ − ۱۵)", fan0.buyWallet === 155, `=${fan0.buyWallet}`);

    // ---------- پیش از پایان بازی ----------
    check("پیش از پایان بازی settled_at خالی است", (await getSettledAt()) === null);
    const before = await computeScores();

    // ---------- پایان بازی: transitionTo("CLOSED") تسویه را اجرا می‌کند ----------
    const tr = await transitionTo("CLOSED", null);
    check("انتقال به CLOSED بدون خطای تسویه", !tr.settleFailed, JSON.stringify(tr));
    check("فاز CLOSED شد", (await getPhase()).phase === "CLOSED");

    const settledAt = await getSettledAt();
    check("settled_at ثبت شد", settledAt !== null, settledAt?.toISOString() ?? "null");

    const rows = await prisma.teamScore.findMany({ orderBy: { rank: "asc" } });
    check("برای هر تیم یک ردیف TeamScore", rows.length === SPEC.length, `تعداد=${rows.length}`);
    check(
      "computedAt همهٔ ردیف‌ها = settled_at",
      !!settledAt && rows.every((r) => r.computedAt.getTime() === settledAt.getTime())
    );

    const byTeamBefore = new Map(before.teams.map((t) => [t.teamId, t]));
    let allMatch = true;
    const mismatches: string[] = [];
    for (const r of rows) {
      const t = byTeamBefore.get(r.teamId);
      const same =
        !!t &&
        r.memberCount === t.memberCount &&
        near(r.juryRaw, t.juryRaw) &&
        near(r.juryAdjusted, t.juryAdjusted) &&
        near(r.people, t.people) &&
        r.supporters === t.supporters &&
        r.coinsReceived === t.coinsReceived &&
        near(r.ai, t.ai) &&
        near(r.ptsJury, t.pts.jury) &&
        near(r.ptsPeople, t.pts.people) &&
        near(r.ptsAi, t.pts.ai) &&
        r.cheatPenalty === t.cheatPenalty &&
        near(r.total, t.total) &&
        r.rank === t.rank;
      if (!same) {
        allMatch = false;
        mismatches.push(r.teamId);
      }
    }
    check("TeamScore ذخیره‌شده = خروجی computeScores", allMatch, mismatches.join(","));
    check("رتبه‌ها ۱..n و یکتا", rows.map((r) => r.rank).join(",") === "1,2,3", rows.map((r) => r.rank).join(","));

    const gammaRow = rows.find((r) => r.teamId === teamIds.gamma)!;
    check("شرکت فردی: memberCount=۱ و داوری همان ۸۰ (اندازهٔ تیم بی‌اثر)", gammaRow.memberCount === 1 && near(gammaRow.juryAdjusted, 80), `${gammaRow.juryAdjusted}`);
    const betaRow = rows.find((r) => r.teamId === teamIds.beta)!;
    check("بتا: حامیان ۳ (حمایت ۲۵ + دو خرید ۱۵)، سکهٔ دریافتی ۵۵", betaRow.supporters === 3 && betaRow.coinsReceived === 55, `${betaRow.supporters}/${betaRow.coinsReceived}`);
    const alphaRow = rows.find((r) => r.teamId === teamIds.alpha)!;
    check(
      "آلفا: حمایت بین‌تیمی و خرید عضو گاما حساب شد (۴ حامی، ۶۵ سکه)",
      alphaRow.supporters === 4 && alphaRow.coinsReceived === 65,
      `${alphaRow.supporters}/${alphaRow.coinsReceived}`
    );

    // ---------- loadSettledOutput ----------
    const loaded = await loadSettledOutput();
    const loadedById = new Map(loaded.teams.map((t) => [t.teamId, t]));
    const loadOk = before.teams.every((t) => {
      const l = loadedById.get(t.teamId);
      return (
        !!l &&
        near(l.juryAdjusted, t.juryAdjusted) &&
        near(l.total, t.total) &&
        l.rank === t.rank &&
        near(l.pts.jury, t.pts.jury) &&
        near(l.pts.people, t.pts.people) &&
        near(l.pts.ai, t.pts.ai)
      );
    });
    check("loadSettledOutput همان نتیجه را بازسازی می‌کند", loadOk, loaded.teams.map((t) => `${t.rank}:${t.total.toFixed(1)}`).join(" "));

    // ---------- idempotency ----------
    // تغییر داده پس از تسویه نباید روی نتیجهٔ ثبت‌شده اثر بگذارد.
    await prisma.product.update({ where: { id: productIds.gamma }, data: { juryWorks: 0, juryValue: 0, juryPitch: 0 } });
    const second = await settleGame();
    check("settleGame دوم alreadySettled برمی‌گرداند", second.alreadySettled, JSON.stringify(second));
    check("settleGame دوم همان settledAt را برمی‌گرداند", !!settledAt && second.settledAt.getTime() === settledAt.getTime());
    check("settleGame دوم تعداد تیم‌ها را درست گزارش می‌کند", second.teams === SPEC.length, `=${second.teams}`);
    const rowsAfter = await prisma.teamScore.findMany();
    const gammaAfter = rowsAfter.find((r) => r.teamId === teamIds.gamma)!;
    check(
      "تسویهٔ دوم TeamScore را بازنویسی نکرد",
      rowsAfter.length === rows.length && near(gammaAfter.juryAdjusted, gammaRow.juryAdjusted) && near(gammaAfter.total, gammaRow.total)
    );
    const settledRows = await prisma.setting.count({ where: { key: SETTLED_AT_KEY } });
    check("فقط یک ردیف settled_at", settledRows === 1);

    // تسویهٔ هم‌زمان (single-flight) پس از پاک کردن نشانه: هر دو فراخوانی یک نتیجه می‌دهند.
    await prisma.setting.delete({ where: { key: SETTLED_AT_KEY } });
    const [c1, c2] = await Promise.all([settleGame(), settleGame()]);
    check(
      "دو settleGame هم‌زمان یک‌بار ثبت می‌کنند",
      c1.settledAt.getTime() === c2.settledAt.getTime() && (await prisma.setting.count({ where: { key: SETTLED_AT_KEY } })) === 1
    );
  } catch (err) {
    console.error(err);
    check("اجرای بدون خطا", false, String(err));
  } finally {
    await prisma.$disconnect();
    ownTempDb?.cleanup();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log("");
  console.log(`نتیجه: ${checks.length - failed.length}/${checks.length} — ${failed.length === 0 ? "PASS" : "FAIL"}`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  ✗ ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
}

void main();
