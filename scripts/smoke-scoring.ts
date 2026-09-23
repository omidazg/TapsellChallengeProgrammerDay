/**
 * دود-تست امتیازدهی پایان بازی.
 * اجرا: npx tsx scripts/smoke-scoring.ts
 *
 * یک پایگاه‌دادهٔ SQLite موقت می‌سازد، ۳ تیم × ۳ کاربر با ایده، محصول،
 * سرمایه‌گذاری متقاطع (و خودی)، خرید، قلب و نمرهٔ داوران می‌سازد، فاز را
 * CLOSED می‌کند و خروجی computeScores/computeAwards/detectAndFlagCollusion را
 * وارسی می‌کند. در پایان داده‌ها پاک و فاز به REGISTRATION برمی‌گردد.
 */

import { createTempDb, type TempDb } from "./lib/temp-db";
import { createRequire } from "node:module";
import path from "node:path";

// `src/lib/db` پکیج `server-only` را import می‌کند که بیرون از Next خطا می‌دهد.
// آن ماژول را با یک ماژول خالی در کش require جایگزین می‌کنیم.
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

let tempDb: TempDb | null = null;

const checks: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

/**
 * پایگاه‌دادهٔ موقت را از روی مایگریشن‌ها می‌سازد، نه با کپی از dev.db.
 * کپی از dev.db روی CI می‌شکند: آنجا dev.db وجود ندارد و نتیجه یک فایل
 * خالی بدون جدول می‌شود. createTempDb همیشه migrate deploy می‌زند.
 */
function makeTempDb() {
  tempDb = createTempDb("smoke-scoring");
}

async function main() {
  makeTempDb();

  const { prisma } = await import("../src/lib/db");
  const { computeScores, computeAwards } = await import("../src/lib/scoring");
  const { detectAndFlagCollusion } = await import("../src/lib/admin");
  const { setPhase } = await import("../src/lib/phase");

  /** پاک کردن همهٔ ردیف‌ها به ترتیب وابستگی کلید خارجی. */
  async function wipe() {
    await prisma.collusionFlag.deleteMany({});
    await prisma.teamScore.deleteMany({});
    await prisma.ledgerEntry.deleteMany({});
    await prisma.adSlotBid.deleteMany({});
    await prisma.adSlot.deleteMany({});
    await prisma.bid.deleteMany({});
    await prisma.auction.deleteMany({});
    await prisma.heart.deleteMany({});
    await prisma.purchase.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.dueDiligenceMessage.deleteMany({});
    await prisma.investment.deleteMany({});
    await prisma.idea.deleteMany({});
    await prisma.teamInvite.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.pushSubscription.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.setting.deleteMany({});
  }

  await wipe();

  const TEAMS = [
    { key: "alpha", name: "تیم آلفا", revenueShare: 30 },
    { key: "beta", name: "تیم بتا", revenueShare: 50 },
    { key: "gamma", name: "تیم گاما", revenueShare: 40 },
  ];
  const POWER_BY_INDEX = ["HYPE", "BARGAIN", "SHIELD"] as const;

  const teamIds: Record<string, string> = {};
  const ideaIds: Record<string, string> = {};
  const productIds: Record<string, string> = {};
  const userIds: Record<string, string> = {}; // `${teamKey}-${i}`

  try {
    // ---------- ساخت تیم‌ها، کاربران، ایده‌ها و محصولات ----------
    for (const [ti, t] of TEAMS.entries()) {
      const team = await prisma.team.create({
        data: { name: t.name, slug: `smoke-${t.key}`, treasury: 0 },
      });
      teamIds[t.key] = team.id;

      for (let i = 0; i < 3; i++) {
        // هر تیم دقیقاً یک عضو BARGAIN، یک SHIELD و یک HYPE دارد (به‌ترتیب چرخشی).
        // سپر دیگر نیازی به «فعال‌سازی» ندارد؛ همیشه غیرفعال (powerUsed نادیده گرفته می‌شود).
        const power = t.key === "gamma" ? POWER_BY_INDEX[i] : POWER_BY_INDEX[(i + 1) % 3];
        const u = await prisma.user.create({
          data: {
            email: `smoke-${t.key}-${i}@example.test`,
            passwordHash: "x",
            nickname: `${t.name} ${i + 1}`,
            role: ["BUILDER", "STORYTELLER", "DEALMAKER"][i],
            power,
            teamId: team.id,
            seedWallet: 100,
            buyWallet: 100,
          },
        });
        userIds[`${t.key}-${i}`] = u.id;
      }

      const idea = await prisma.idea.create({
        data: {
          teamId: team.id,
          title: `ایدهٔ ${t.name}`,
          oneLiner: "یک خطی",
          problem: "مسئله",
          audience: "مخاطب",
          buildPlan: "برنامهٔ ساخت",
          fundingCap: 200,
          revenueShare: t.revenueShare,
          submittedAt: new Date(),
        },
      });
      ideaIds[t.key] = idea.id;

      const product = await prisma.product.create({
        data: {
          teamId: team.id,
          name: `محصول ${t.name}`,
          price: 20,
          submittedAt: new Date(),
          juryQuality: [90, 70, 50][ti],
          juryTeaser: [80, 60, 40][ti],
          aiQuality: 55,
        },
      });
      productIds[t.key] = product.id;
    }

    // ---------- سرمایه‌گذاری: متقاطع + خودی ----------
    const invest = async (teamKey: string, userKey: string, amount: number, selfFunded: boolean) => {
      await prisma.investment.create({
        data: { ideaId: ideaIds[teamKey], userId: userIds[userKey], amount, selfFunded },
      });
      await prisma.user.update({ where: { id: userIds[userKey] }, data: { seedWallet: { decrement: amount } } });
    };

    // آلفا: ۴۰ از بتا + ۳۰ از گاما خارجی، ۲۰ خودی
    await invest("alpha", "beta-0", 40, false);
    await invest("alpha", "gamma-0", 30, false);
    await invest("alpha", "alpha-0", 20, true);
    // بتا: ۳۰ خارجی از آلفا
    await invest("beta", "alpha-1", 30, false);
    // گاما: بدون سرمایهٔ خارجی، فقط ۱۰ خودی
    await invest("gamma", "gamma-1", 10, true);

    // ---------- خرید ----------
    const buy = async (teamKey: string, userKey: string, amount: number) => {
      await prisma.purchase.create({
        data: { productId: productIds[teamKey], userId: userIds[userKey], amount },
      });
      await prisma.user.update({ where: { id: userIds[userKey] }, data: { buyWallet: { decrement: amount } } });
    };

    // زوج تبانی: آلفا ↔ بتا با مجموع ≥ ۶۰
    await buy("alpha", "beta-0", 40); // بتا از آلفا می‌خرد
    await buy("beta", "alpha-0", 35); // آلفا از بتا می‌خرد
    await buy("alpha", "gamma-0", 25);
    await buy("beta", "gamma-1", 20);
    await buy("gamma", "alpha-2", 15);

    // ---------- قلب ----------
    await prisma.heart.create({ data: { productId: productIds["alpha"], userId: userIds["beta-1"] } });
    await prisma.heart.create({ data: { productId: productIds["alpha"], userId: userIds["gamma-2"] } });
    await prisma.heart.create({ data: { productId: productIds["beta"], userId: userIds["alpha-2"] } });

    // ---------- تنظیمات: جریمهٔ اعشاری برای آزمودن مسیر getSettingFloat ----------
    const PENALTY_PER_COIN = 1.5;
    await prisma.setting.create({ data: { key: "penalty_per_coin", value: String(PENALTY_PER_COIN) } });

    // ---------- فاز پایان بازی ----------
    await setPhase("CLOSED", null);
    const phaseRow = await prisma.setting.findUnique({ where: { key: "phase" } });
    check("فاز روی CLOSED تنظیم شد", phaseRow?.value === "CLOSED", String(phaseRow?.value));

    // ---------- امتیازدهی ----------
    const output = await computeScores();
    const byTeam = new Map(output.teams.map((t) => [t.teamId, t]));
    const alpha = byTeam.get(teamIds["alpha"])!;
    const beta = byTeam.get(teamIds["beta"])!;
    const gamma = byTeam.get(teamIds["gamma"])!;

    check("هر سه تیم امتیاز گرفتند", output.teams.length === 3, `تعداد=${output.teams.length}`);

    // فروش ناخالص/خالص
    check(
      "grossSales آلفا = ۴۰+۲۵ = ۶۵",
      alpha.grossSales === 65,
      `gross=${alpha.grossSales}`
    );
    check("grossSales بتا = ۳۵+۲۰ = ۵۵", beta.grossSales === 55, `gross=${beta.grossSales}`);
    check("grossSales گاما = ۱۵", gamma.grossSales === 15, `gross=${gamma.grossSales}`);
    for (const [name, t] of [["آلفا", alpha], ["بتا", beta], ["گاما", gamma]] as const) {
      check(
        `netSales ${name} = gross - dividendsPaid`,
        t.netSales === t.grossSales - t.dividendsPaid,
        `net=${t.netSales} gross=${t.grossSales} div=${t.dividendsPaid}`
      );
    }

    // سرمایهٔ خارجی و خودی
    check("externalCapital آلفا = ۷۰ (۲۰ خودی حساب نمی‌شود)", alpha.externalCapital === 70, `=${alpha.externalCapital}`);
    check("selfCapital آلفا = ۲۰", alpha.selfCapital === 20, `=${alpha.selfCapital}`);
    check("externalCapital گاما = ۰", gamma.externalCapital === 0, `=${gamma.externalCapital}`);

    // سود: مجموع سود هر تیم ≤ gross × سهم
    for (const [name, t, share] of [
      ["آلفا", alpha, 30],
      ["بتا", beta, 50],
      ["گاما", gamma, 40],
    ] as const) {
      const cap = t.grossSales * (share / 100);
      check(
        `مجموع سود پرداختی ${name} ≤ فروش ناخالص × سهم`,
        t.dividendsPaid <= cap + 1e-9,
        `paid=${t.dividendsPaid} cap=${cap}`
      );
    }
    const dividendTotal = output.dividends.reduce((a, d) => a + d.dividend, 0);
    const paidTotal = output.teams.reduce((a, t) => a + t.dividendsPaid, 0);
    check("مجموع خطوط سود = مجموع dividendsPaid تیم‌ها", dividendTotal === paidTotal, `${dividendTotal} vs ${paidTotal}`);
    check("گاما بدون سرمایهٔ خارجی سودی پرداخت نکرد", gamma.dividendsPaid === 0, `=${gamma.dividendsPaid}`);

    // قلب و خریدار یکتا
    check("قلب‌های آلفا = ۲", alpha.hearts === 2, `=${alpha.hearts}`);
    check("خریداران یکتای آلفا = ۲", alpha.uniqueBuyers === 2, `=${alpha.uniqueBuyers}`);

    // کیفیت از داور (نه هوش مصنوعی)
    check("کیفیت آلفا از نمرهٔ داور ۹۰ آمده", alpha.quality === 90, `=${alpha.quality}`);

    // جریمهٔ خرج‌نشده: فقط روی سکهٔ «خرج‌شدنی» حساب می‌شود (min(left, spendable))، نه کل مانده.
    // مقادیر زیر دستی از روی فیکسچر (ایده‌ها/محصولات ثبت‌شده، سرمایه‌گذاری‌ها، خریدها، قدرت‌ها)
    // با فرمول src/lib/scoring.ts محاسبه شده‌اند تا این یک وارسی مستقل از پیاده‌سازی باشد:
    //   seedSpendable هر کاربر = Σ روی ایده‌های ثبت‌شدهٔ ۲ تیم دیگر: max(0, ۴۰ − سرمایه‌گذاری‌شده)
    //   buySpendable هر کاربر = Σ روی محصولات ثبت‌شدهٔ ۲ تیم دیگر (قیمت=۲۰، سقف=۴۰):
    //     floor(max(0,۴۰−خریده‌شده)/۲۰) × (۲۰ − تخفیفِ BARGAIN‌ی که ۳ است)
    check("جریمهٔ هر سه تیم اعمال شد", [alpha, beta, gamma].every((t) => t.unspentPenalty > 0),
      `alpha=${alpha.unspentPenalty} beta=${beta.unspentPenalty} gamma=${gamma.unspentPenalty}`);
    check(
      "جریمهٔ آلفا فقط روی سکهٔ خرج‌شدنی حساب شد (نه کل مانده)؛ ضریب اعشاری ۱٫۵ هم اعمال شد",
      Math.abs(alpha.unspentPenalty - 1.5 * 384) < 1e-9,
      `penalty=${alpha.unspentPenalty} انتظار=${1.5 * 384}`
    );
    check(
      "جریمهٔ بتا فقط روی سکهٔ خرج‌شدنی حساب شد",
      Math.abs(beta.unspentPenalty - 1.5 * 394) < 1e-9,
      `penalty=${beta.unspentPenalty} انتظار=${1.5 * 394}`
    );
    check(
      "جریمهٔ گاما فقط روی سکهٔ خرج‌شدنی حساب شد (سپر دیگر معافیت ثابت نمی‌دهد)",
      Math.abs(gamma.unspentPenalty - 1.5 * 381) < 1e-9,
      `penalty=${gamma.unspentPenalty} انتظار=${1.5 * 381}`
    );

    // ---------- پرتفوی و سلیقه ----------
    // پرتفوی: اعتبار سود هر سرمایه‌گذاری به تیم *سرمایه‌گذار* می‌رسد، نه تیم سرمایه‌پذیر.
    //   آلفا: alpha-1 (سپردار) با ۳۰ سکه روی بتا سرمایه‌گذاری کرد؛ سود=floor(27.5*30/30)=۲۷، سپر اثر ندارد چون ۲۷>سقف سپر=۱۵
    //   بتا: beta-0 با ۴۰ سکه روی آلفا؛ سود=floor(19.5*40/70)=۱۱
    //   گاما: gamma-0 با ۳۰ سکه روی آلفا؛ سود=floor(19.5*30/70)=۸
    check("پرتفوی آلفا = ۲۷ (سود سرمایه‌گذاری alpha-1 روی بتا)", alpha.portfolio === 27, `=${alpha.portfolio}`);
    check("پرتفوی بتا = ۱۱ (سود سرمایه‌گذاری beta-0 روی آلفا)", beta.portfolio === 11, `=${beta.portfolio}`);
    check("پرتفوی گاما = ۸ (سود سرمایه‌گذاری gamma-0 روی آلفا)", gamma.portfolio === 8, `=${gamma.portfolio}`);

    // سلیقه: Σ خریدهای اعضا از تیم‌های دیگر × کیفیت مؤثر فروشنده / ۱۰۰
    //   آلفا: alpha-0 از بتا خرید ۳۵×کیفیت۷۰/۱۰۰=۲۴٫۵ + alpha-2 از گاما خرید ۱۵×کیفیت۵۰/۱۰۰=۷٫۵ → ۳۲
    //   بتا: beta-0 از آلفا خرید ۴۰×کیفیت۹۰/۱۰۰=۳۶
    //   گاما: gamma-0 از آلفا خرید ۲۵×۹۰/۱۰۰=۲۲٫۵ + gamma-1 از بتا خرید ۲۰×۷۰/۱۰۰=۱۴ → ۳۶٫۵
    check("سلیقهٔ آلفا = ۳۲", Math.abs(alpha.taste - 32) < 1e-9, `=${alpha.taste}`);
    check("سلیقهٔ بتا = ۳۶", Math.abs(beta.taste - 36) < 1e-9, `=${beta.taste}`);
    check("سلیقهٔ گاما = ۳۶٫۵", Math.abs(gamma.taste - 36.5) < 1e-9, `=${gamma.taste}`);

    // رتبه‌بندی
    const ranks = [...output.teams].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    check("رتبه‌ها ۱..۳ و یکتا هستند", ranks.map((r) => r.rank).join(",") === "1,2,3", ranks.map((r) => r.rank).join(","));
    check(
      "ترتیب رتبه با امتیاز کل نزولی هم‌خوان است",
      ranks.every((r, i) => i === 0 || ranks[i - 1].total >= r.total),
      ranks.map((r) => `${r.rank}:${r.total.toFixed(1)}`).join(" ")
    );
    check("آلفا (بیشترین فروش/کیفیت/سرمایه) رتبهٔ ۱ است", alpha.rank === 1, `rank=${alpha.rank}`);

    // ---------- جوایز ----------
    const teams = await prisma.team.findMany({ select: { id: true, name: true } });
    const users = await prisma.user.findMany({ select: { id: true, nickname: true } });
    const awards = computeAwards(output, {
      teamNames: new Map(teams.map((t) => [t.id, t.name])),
      userNicknames: new Map(users.map((u) => [u.id, u.nickname])),
    });
    const perTeam = new Map<string, number>();
    for (const a of awards) if (a.teamId) perTeam.set(a.teamId, (perTeam.get(a.teamId) ?? 0) + 1);
    check(
      "هیچ تیمی بیش از دو جایزه نگرفت",
      [...perTeam.values()].every((n) => n <= 2),
      [...perTeam.entries()].map(([id, n]) => `${id.slice(0, 6)}=${n}`).join(" ")
    );
    check("جایزهٔ قهرمان به تیم رتبهٔ ۱ رسید",
      awards.find((a) => a.key === "champion")?.teamId === alpha.teamId,
      String(awards.find((a) => a.key === "champion")?.teamName));
    const bestInvestor = awards.find((a) => a.key === "topInvestor");
    // beta-0 با ۴۰ و alpha-1 با ۳۰ واجد شرایط‌اند؛ gamma-0 با ۳۰ هم همین‌طور. کمتر از ۳۰ نباید برنده شود.
    const investedOfWinner = bestInvestor
      ? output.dividends.filter((d) => d.userId === bestInvestor.userId).reduce((a, d) => a + d.invested, 0)
      : 0;
    check(
      "بهترین سرمایه‌گذار حداقل ۳۰ سکه سرمایه‌گذاری کرده",
      !!bestInvestor && investedOfWinner >= 30,
      `invested=${investedOfWinner}`
    );

    // ---------- تشخیص تبانی ----------
    const flags = await detectAndFlagCollusion();
    const pair = flags.find(
      (f) =>
        (f.teamId === teamIds["alpha"] && f.otherTeamId === teamIds["beta"]) ||
        (f.teamId === teamIds["beta"] && f.otherTeamId === teamIds["alpha"])
    );
    check("پرچم تبانی برای زوج آلفا↔بتا ثبت شد", !!pair, `تعداد پرچم=${flags.length}`);
    // detectAndFlagCollusion (src/lib/admin.ts) هم خرید و هم سرمایه‌گذاری را جریان حساب می‌کند
    // (از وقتی سرمایه‌گذاری خودی ممنوع شده، همهٔ سرمایه‌گذاری‌ها بیرونی‌اند):
    //   آلفا→بتا: خرید alpha-0 از بتا (۳۵) + سرمایه‌گذاری alpha-1 روی بتا (۳۰) = ۶۵
    //   بتا→آلفا: خرید beta-0 از آلفا (۴۰) + سرمایه‌گذاری beta-0 روی آلفا (۴۰) = ۸۰
    check(
      "مبالغ پرچم درست‌اند (۶۵ و ۸۰؛ خرید + سرمایه‌گذاری هر دو حساب می‌شوند)",
      !!pair && pair.amountAB === 65 && pair.amountBA === 80,
      pair ? `AB=${pair.amountAB} BA=${pair.amountBA}` : "-"
    );
    // اجرای دوباره نباید ردیف تکراری بسازد
    const flags2 = await detectAndFlagCollusion();
    check("اجرای دوبارهٔ تشخیص، پرچم تکراری نساخت", flags2.length === flags.length, `${flags.length} → ${flags2.length}`);

    // ---------- پاک‌سازی و بازگرداندن فاز ----------
    await wipe();
    await setPhase("REGISTRATION", null);
    const restored = await prisma.setting.findUnique({ where: { key: "phase" } });
    const leftovers = await prisma.team.count();
    check("پاک‌سازی انجام شد و فاز به REGISTRATION برگشت",
      restored?.value === "REGISTRATION" && leftovers === 0,
      `phase=${restored?.value} teams=${leftovers}`);
  } catch (err) {
    console.error(err);
    check("اجرای بدون خطا", false, String(err));
  } finally {
    await prisma.$disconnect();
    tempDb?.cleanup();
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
