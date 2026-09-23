/**
 * دود-تست تسویهٔ نهایی.
 * اجرا: npx tsx scripts/smoke-settlement.ts
 *
 * روی یک پایگاه‌دادهٔ SQLite موقت (`smoke-settlement.db`) کار می‌کند؛ اسکیمای آن را
 * خود اسکریپت با دستور زیر می‌سازد (DATABASE_URL فقط برای همان فرایند فرزند ست می‌شود):
 *
 *     npx prisma db push --url file:./smoke-settlement.db
 *
 * (فایل پیش از اجرا پاک می‌شود، پس نیازی به `--force-reset` — که روی پایگاه‌دادهٔ موجود
 *  مخرب است و برای ایجنت‌ها مسدود شده — نیست.)
 *
 * سناریو: ۲ تیم، سرمایه‌گذاری از مسیر واقعی investCore، خرید، سپس settleGame دوبار.
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
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

const ROOT = path.resolve(__dirname, "..");
const DB_FILE = path.join(ROOT, "smoke-settlement.db");
const DB_URL = `file:${DB_FILE.replace(/\\/g, "/")}`;

// باید پیش از import شدن src/lib/db ست شود.
process.env.DATABASE_URL = DB_URL;

const checks: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

function cleanTempFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const f = `${DB_FILE}${suffix}`;
    if (existsSync(f)) rmSync(f, { force: true });
  }
}

/** اسکیمای پایگاه‌دادهٔ موقت را می‌سازد (فایل تازه ساخته می‌شود، پس push خالی است و مخرب نیست). */
function pushSchema() {
  cleanTempFiles();
  execFileSync("npx", ["prisma", "db", "push", "--url", DB_URL], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

async function main() {
  pushSchema();

  const { prisma } = await import("../src/lib/db");
  const { investCore } = await import("../src/lib/invest");
  const { settleGame, getSettledAt, loadSettledOutput } = await import("../src/lib/settlement");
  const { setPhase } = await import("../src/lib/phase");

  const PENALTY_PER_COIN = 1.5;

  try {
    await prisma.setting.create({ data: { key: "penalty_per_coin", value: String(PENALTY_PER_COIN) } });
    await prisma.setting.create({ data: { key: "max_per_target", value: "40" } });

    // ---------- تیم‌ها، کاربران، ایده‌ها و محصولات ----------
    const teamIds: Record<string, string> = {};
    const ideaIds: Record<string, string> = {};
    const productIds: Record<string, string> = {};
    const userIds: Record<string, string> = {};

    const SPEC = [
      { key: "alpha", name: "تیم آلفا", revenueShare: 50, jury: 90 },
      { key: "beta", name: "تیم بتا", revenueShare: 40, jury: 70 },
    ];

    for (const t of SPEC) {
      const team = await prisma.team.create({ data: { name: t.name, slug: `smoke-${t.key}` } });
      teamIds[t.key] = team.id;
      for (let i = 1; i <= 2; i++) {
        const u = await prisma.user.create({
          data: {
            email: `settle-${t.key}-${i}@example.test`,
            passwordHash: "x",
            nickname: `${t.name} ${i}`,
            role: "DEALMAKER",
            power: "HYPE",
            teamId: team.id,
            seedWallet: 100,
            buyWallet: 100,
          },
        });
        userIds[`${t.key}${i}`] = u.id;
      }
      const idea = await prisma.idea.create({
        data: {
          teamId: team.id,
          title: `ایدهٔ ${t.name}`,
          oneLiner: "یک خطی",
          problem: "مسئله",
          audience: "مخاطب",
          buildPlan: "برنامه",
          fundingCap: 200,
          revenueShare: t.revenueShare,
          submittedAt: new Date(),
        },
      });
      ideaIds[t.key] = idea.id;
      const product = await prisma.product.create({
        data: { teamId: team.id, name: `محصول ${t.name}`, price: 20, submittedAt: new Date(), juryQuality: t.jury, juryTeaser: t.jury - 10 },
      });
      productIds[t.key] = product.id;
    }

    // ---------- سرمایه‌گذاری از مسیر واقعی (تا دفتر کل خزانه هم آزموده شود) ----------
    await setPhase("SEED_ROUND", null);
    const invests = [
      { team: "alpha", user: "beta1", amount: 40 },
      { team: "alpha", user: "beta2", amount: 20 },
      { team: "beta", user: "alpha1", amount: 30 },
    ];
    for (const iv of invests) {
      const res = await investCore(prisma, userIds[iv.user], ideaIds[iv.team], iv.amount);
      if (!res.ok) throw new Error(`investCore شکست خورد: ${res.error}`);
    }

    // سرمایه‌گذاری خودی از مسیر واقعی دیگر ممکن نیست (ممنوع شده): وارسی رد شدنش
    const selfAttempt = await investCore(prisma, userIds["alpha2"], ideaIds["alpha"], 10);
    check("investCore سرمایه‌گذاری خودی را رد می‌کند", selfAttempt.ok === false, JSON.stringify(selfAttempt));

    // دادهٔ قدیمی (پیش از ممنوعیت): یک ردیف Investment خودیِ alpha2 مستقیم ساخته می‌شود، دقیقاً
    // همان‌طور که مسیر واقعی پیش از این تغییر می‌ساخت (خزانه + سطر دفتر کل TREASURY هم دارد)،
    // تا وارسی شود که سرمایه‌گذاری خودیِ قدیمی هنوز از سرمایهٔ بیرونی/سود کنار گذاشته می‌شود.
    const legacySelfInvestment = await prisma.investment.create({
      data: { ideaId: ideaIds["alpha"], userId: userIds["alpha2"], amount: 10, selfFunded: true },
    });
    await prisma.user.update({ where: { id: userIds["alpha2"] }, data: { seedWallet: { decrement: 10 } } });
    await prisma.team.update({ where: { id: teamIds["alpha"] }, data: { treasury: { increment: 10 } } });
    await prisma.ledgerEntry.create({
      data: {
        userId: userIds["alpha2"],
        teamId: teamIds["alpha"],
        wallet: "TREASURY",
        delta: 10,
        reason: "INVEST",
        refId: legacySelfInvestment.id,
      },
    });

    const alphaTeam = await prisma.team.findUniqueOrThrow({ where: { id: teamIds["alpha"] } });
    check("خزانهٔ آلفا = ۴۰+۲۰+۱۰ = ۷۰", alphaTeam.treasury === 70, `=${alphaTeam.treasury}`);
    const treasuryRows = await prisma.ledgerEntry.findMany({ where: { wallet: "TREASURY", teamId: teamIds["alpha"] } });
    check("سه سطر TREASURY برای آلفا ثبت شد", treasuryRows.length === 3, `=${treasuryRows.length}`);
    check(
      "جمع سطرهای TREASURY با خزانه برابر است",
      treasuryRows.reduce((a, r) => a + r.delta, 0) === alphaTeam.treasury,
      `ledger=${treasuryRows.reduce((a, r) => a + r.delta, 0)} treasury=${alphaTeam.treasury}`
    );
    const investmentCount = await prisma.investment.count();
    const treasuryAll = await prisma.ledgerEntry.count({ where: { wallet: "TREASURY", reason: "INVEST" } });
    check("برای هر سرمایه‌گذاری یک سطر TREASURY هست", treasuryAll === investmentCount, `${treasuryAll}/${investmentCount}`);

    // بک‌فیل نباید چیزی اضافه کند (ایدمپوتنت)
    {
      const existing = await prisma.ledgerEntry.findMany({
        where: { wallet: "TREASURY", reason: "INVEST", refId: { not: null } },
        select: { refId: true },
      });
      const done = new Set(existing.map((e) => e.refId));
      const all = await prisma.investment.findMany({ select: { id: true } });
      const missing = all.filter((i) => !done.has(i.id)).length;
      check("بک‌فیل خزانه چیزی برای ساختن ندارد", missing === 0, `missing=${missing}`);
    }

    // ---------- خرید ----------
    const buy = async (teamKey: string, userKey: string, amount: number) => {
      await prisma.purchase.create({ data: { productId: productIds[teamKey], userId: userIds[userKey], amount } });
      await prisma.user.update({ where: { id: userIds[userKey] }, data: { buyWallet: { decrement: amount } } });
      await prisma.ledgerEntry.create({
        data: { userId: userIds[userKey], teamId: teamIds[teamKey], wallet: "BUY", delta: -amount, reason: "PURCHASE" },
      });
    };
    await buy("alpha", "beta1", 30);
    await buy("alpha", "beta2", 20);
    await buy("beta", "alpha1", 25);

    // انتظار: آلفا gross=۵۰، سهم ۵۰٪ → استخر ۲۵، سرمایهٔ خارجی ۶۰ → beta1=۱۶، beta2=۸
    //         بتا gross=۲۵، سهم ۴۰٪ → استخر ۱۰، سرمایهٔ خارجی ۳۰ → alpha1=۱۰
    const EXPECTED = { beta1: 16, beta2: 8, alpha1: 10 } as const;
    const EXPECTED_TOTAL = EXPECTED.beta1 + EXPECTED.beta2 + EXPECTED.alpha1;

    const before = await prisma.user.findMany({ select: { id: true, buyWallet: true, seedWallet: true } });
    const buyBefore = new Map(before.map((u) => [u.id, u.buyWallet]));
    const leftoverBefore = before.reduce((a, u) => a + u.buyWallet + u.seedWallet, 0);

    // ---------- تسویه (بار اول) ----------
    await setPhase("CLOSED", null);
    const first = await settleGame();
    check("تسویهٔ اول alreadySettled=false", first.alreadySettled === false, String(first.alreadySettled));
    check(`مجموع سود پرداختی = ${EXPECTED_TOTAL}`, first.dividendsPaid === EXPECTED_TOTAL, `=${first.dividendsPaid}`);
    check("نتیجهٔ دو تیم ثبت شد", first.teams === 2, `=${first.teams}`);

    const settledAt = await getSettledAt();
    check("کلید settled_at نوشته شد", !!settledAt, settledAt ? settledAt.toISOString() : "null");

    const scoreRows = await prisma.teamScore.findMany();
    check("برای هر دو تیم سطر TeamScore هست", scoreRows.length === 2, `=${scoreRows.length}`);
    check(
      "ستون‌های TeamScore پر شده‌اند (مجموع فروش ناخالص = ۷۵)",
      scoreRows.reduce((a, s) => a + s.grossSales, 0) === 75,
      `=${scoreRows.reduce((a, s) => a + s.grossSales, 0)}`
    );
    check(
      "computedAt همان زمان تسویه است",
      scoreRows.every((s) => Math.abs(s.computedAt.getTime() - (settledAt?.getTime() ?? 0)) < 2000),
      scoreRows.map((s) => s.computedAt.toISOString()).join(" ")
    );

    // جریمه باید روی کیف‌پول‌های *پیش از* واریز سود، و فقط روی سکهٔ «خرج‌شدنی» حساب شده باشد
    // (min(left, spendable))، نه کل مانده — leftoverBefore دیگر معیار درستی نیست.
    // مقدار زیر دستی از روی فیکسچر محاسبه شده (۲ ایده/محصول ثبت‌شده، قیمت=۲۰، سقف=۴۰):
    //   alpha1: seedSpendable=max(0,40−30)=10، buySpendable=floor(max(0,40−25)/20)*20=0 → min(70,10)+min(75,0)=10
    //   alpha2: seedSpendable=max(0,40−0)=40، buySpendable=floor(40/20)*20=40 → min(90,40)+min(100,40)=80
    //   beta1:  seedSpendable=max(0,40−40)=0،  buySpendable=floor(max(0,40−30)/20)*20=0 → min(60,0)+min(70,0)=0
    //   beta2:  seedSpendable=max(0,40−20)=20، buySpendable=floor(max(0,40−20)/20)*20=20 → min(80,20)+min(80,20)=40
    //   جمع = ۱۰+۸۰+۰+۴۰ = ۱۳۰
    const penaltyTotal = scoreRows.reduce((a, s) => a + s.unspentPenalty, 0);
    const EXPECTED_UNSPENT_SPENDABLE_COINS = 130;
    check(
      "جریمهٔ خرج‌نشده فقط روی سکهٔ خرج‌شدنیِ پیش از واریز سود حساب شد",
      Math.abs(penaltyTotal - PENALTY_PER_COIN * EXPECTED_UNSPENT_SPENDABLE_COINS) < 1e-6,
      `penalty=${penaltyTotal} انتظار=${PENALTY_PER_COIN * EXPECTED_UNSPENT_SPENDABLE_COINS} (leftoverBefore خام=${leftoverBefore})`
    );

    const divRows1 = await prisma.ledgerEntry.findMany({ where: { reason: "DIVIDEND", wallet: "BUY" } });
    check("سه سطر DIVIDEND ساخته شد", divRows1.length === 3, `=${divRows1.length}`);
    check(
      "هر سطر DIVIDEND refId تیم سرمایه‌پذیر دارد",
      divRows1.every((r) => r.refId === teamIds["alpha"] || r.refId === teamIds["beta"]),
      divRows1.map((r) => String(r.refId).slice(0, 6)).join(" ")
    );
    for (const [key, amount] of Object.entries(EXPECTED)) {
      const u = await prisma.user.findUniqueOrThrow({ where: { id: userIds[key] } });
      check(
        `کیف خرید ${key} به اندازهٔ ${amount} زیاد شد`,
        u.buyWallet === (buyBefore.get(u.id) ?? 0) + amount,
        `${buyBefore.get(u.id)} → ${u.buyWallet}`
      );
    }

    // ---------- تسویه (بار دوم) ----------
    const second = await settleGame();
    check("تسویهٔ دوم alreadySettled=true", second.alreadySettled === true, String(second.alreadySettled));
    check("تسویهٔ دوم همان مجموع سود را گزارش می‌کند", second.dividendsPaid === EXPECTED_TOTAL, `=${second.dividendsPaid}`);

    const divRows2 = await prisma.ledgerEntry.findMany({ where: { reason: "DIVIDEND", wallet: "BUY" } });
    check("سطرهای DIVIDEND تکراری نشدند", divRows2.length === divRows1.length, `${divRows1.length} → ${divRows2.length}`);
    for (const [key, amount] of Object.entries(EXPECTED)) {
      const u = await prisma.user.findUniqueOrThrow({ where: { id: userIds[key] } });
      check(
        `کیف خرید ${key} بار دوم تغییر نکرد`,
        u.buyWallet === (buyBefore.get(u.id) ?? 0) + amount,
        `=${u.buyWallet}`
      );
    }
    const scoreRows2 = await prisma.teamScore.findMany();
    check("TeamScore تکراری ساخته نشد", scoreRows2.length === 2, `=${scoreRows2.length}`);

    // ---------- آیتم ۳۵: ستون‌های خام rank/selfCapital/quality/teaser ----------
    const alphaScore = scoreRows2.find((s) => s.teamId === teamIds["alpha"])!;
    const betaScore = scoreRows2.find((s) => s.teamId === teamIds["beta"])!;
    check("rank آلفا و بتا هرکدام یک‌بار ۱ و ۲ است", new Set([alphaScore.rank, betaScore.rank]).size === 2 && [1, 2].includes(alphaScore.rank) && [1, 2].includes(betaScore.rank), `alpha=${alphaScore.rank} beta=${betaScore.rank}`);
    check("selfCapital آلفا = ۱۰ (سرمایه‌گذاری خودیِ alpha2)", alphaScore.selfCapital === 10, `=${alphaScore.selfCapital}`);
    check("selfCapital بتا = ۰ (سرمایه‌گذاری خودی نداشت)", betaScore.selfCapital === 0, `=${betaScore.selfCapital}`);
    check("quality آلفا = ۹۰ (نمرهٔ خام داور)", alphaScore.quality === 90, `=${alphaScore.quality}`);
    check("teaser آلفا = ۸۰ (نمرهٔ خام تیزر داور)", alphaScore.teaser === 80, `=${alphaScore.teaser}`);
    check("quality بتا = ۷۰", betaScore.quality === 70, `=${betaScore.quality}`);
    check("teaser بتا = ۶۰", betaScore.teaser === 60, `=${betaScore.teaser}`);

    // پرتفوی: سود سرمایه‌گذاری‌های اعضا روی تیم‌های دیگر، به تیم *سرمایه‌گذار* می‌رسد
    //   آلفا: alpha1 روی بتا سرمایه‌گذاری کرد و ۱۰ سود گرفت → پرتفوی آلفا = ۱۰
    //   بتا: beta1+beta2 روی آلفا سرمایه‌گذاری کردند و ۱۶+۸=۲۴ سود گرفتند → پرتفوی بتا = ۲۴
    check("portfolio آلفا = ۱۰ (سود alpha1 روی بتا)", alphaScore.portfolio === 10, `=${alphaScore.portfolio}`);
    check("portfolio بتا = ۲۴ (سود beta1+beta2 روی آلفا)", betaScore.portfolio === 24, `=${betaScore.portfolio}`);

    // سلیقه: Σ خرید اعضا از تیم‌های دیگر × کیفیت مؤثر فروشنده / ۱۰۰
    //   بتا: beta1 (۳۰×۹۰/۱۰۰=۲۷) + beta2 (۲۰×۹۰/۱۰۰=۱۸) از آلفا → ۴۵
    //   آلفا: alpha1 (۲۵×۷۰/۱۰۰=۱۷٫۵) از بتا → ۱۷٫۵
    check("taste آلفا = ۱۷٫۵", Math.abs(alphaScore.taste - 17.5) < 1e-9, `=${alphaScore.taste}`);
    check("taste بتا = ۴۵", Math.abs(betaScore.taste - 45) < 1e-9, `=${betaScore.taste}`);

    // مسیر جدید loadSettledOutput باید همین مقادیر خام را مستقیم بخواند (بدون بازسازی)
    const outputNew = await loadSettledOutput();
    const alphaOutNew = outputNew.teams.find((t) => t.teamId === teamIds["alpha"])!;
    const betaOutNew = outputNew.teams.find((t) => t.teamId === teamIds["beta"])!;
    check("loadSettledOutput (مسیر جدید): selfCapital آلفا از ستون خوانده شد", alphaOutNew.selfCapital === 10, `=${alphaOutNew.selfCapital}`);
    check("loadSettledOutput (مسیر جدید): quality/teaser آلفا از ستون خوانده شد", alphaOutNew.quality === 90 && alphaOutNew.teaser === 80, `q=${alphaOutNew.quality} t=${alphaOutNew.teaser}`);
    check(
      "loadSettledOutput (مسیر جدید): portfolio/taste از ستون خوانده شدند",
      alphaOutNew.portfolio === 10 && Math.abs(alphaOutNew.taste - 17.5) < 1e-9 && betaOutNew.portfolio === 24 && Math.abs(betaOutNew.taste - 45) < 1e-9,
      `alpha portfolio=${alphaOutNew.portfolio} taste=${alphaOutNew.taste}; beta portfolio=${betaOutNew.portfolio} taste=${betaOutNew.taste}`
    );
    check(
      "loadSettledOutput (مسیر جدید): pts.portfolio/pts.taste هم بازسازی شدند",
      alphaOutNew.pts.portfolio === alphaScore.ptsPortfolio && alphaOutNew.pts.taste === alphaScore.ptsTaste,
      `pts.portfolio=${alphaOutNew.pts.portfolio} pts.taste=${alphaOutNew.pts.taste}`
    );
    check("loadSettledOutput (مسیر جدید): rank با ستون rank یکی است", alphaOutNew.rank === alphaScore.rank && betaOutNew.rank === betaScore.rank, `alpha=${alphaOutNew.rank}/${alphaScore.rank}`);
    check(
      "loadSettledOutput (مسیر جدید): مجموع total با مسیر بازمحاسبه یکی است",
      Math.abs(alphaOutNew.total - alphaScore.total) < 1e-9 && Math.abs(betaOutNew.total - betaScore.total) < 1e-9,
      `alpha=${alphaOutNew.total}/${alphaScore.total}`
    );

    // ---------- سازگاری با سطرهای قدیمی: rank=۰ باید مسیر بازسازی قدیمی را فعال کند ----------
    await prisma.teamScore.updateMany({ data: { rank: 0 } });
    const outputLegacy = await loadSettledOutput();
    const alphaOutLegacy = outputLegacy.teams.find((t) => t.teamId === teamIds["alpha"])!;
    const betaOutLegacy = outputLegacy.teams.find((t) => t.teamId === teamIds["beta"])!;
    check(
      "بک‌آپشن: rank=۰ → بازسازی قدیمی فعال می‌شود (رتبه‌ها همچنان ۱ و ۲ درست)",
      new Set([alphaOutLegacy.rank, betaOutLegacy.rank]).size === 2 && [1, 2].includes(alphaOutLegacy.rank!) && [1, 2].includes(betaOutLegacy.rank!),
      `alpha=${alphaOutLegacy.rank} beta=${betaOutLegacy.rank}`
    );
    check(
      "بک‌آپشن: selfCapital آلفا با بازسازی از Investment همان ۱۰ است",
      alphaOutLegacy.selfCapital === 10,
      `=${alphaOutLegacy.selfCapital}`
    );
    check(
      "بک‌آپشن: total ها با مسیر جدید یکسان می‌ماند (idempotent در محاسبه)",
      Math.abs(alphaOutLegacy.total - alphaScore.total) < 1e-9 && Math.abs(betaOutLegacy.total - betaScore.total) < 1e-9,
      `alpha=${alphaOutLegacy.total}/${alphaScore.total}`
    );
    // بازگرداندن ستون rank به حالت درست (برای پاکیزگی، هرچند فرایند در حال پایان است)
    await prisma.teamScore.update({ where: { teamId: teamIds["alpha"] }, data: { rank: alphaScore.rank } });
    await prisma.teamScore.update({ where: { teamId: teamIds["beta"] }, data: { rank: betaScore.rank } });
  } catch (err) {
    console.error(err);
    check("اجرای بدون خطا", false, String(err));
  } finally {
    await prisma.$disconnect();
    cleanTempFiles();
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
