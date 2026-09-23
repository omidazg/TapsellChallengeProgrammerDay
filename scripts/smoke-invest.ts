/**
 * تست دودی منطق سرمایه‌گذاری.
 * اجرا: npx tsx scripts/smoke-invest.ts
 *
 * سه تیم (دو تیم با ایده + یک تیم فقط برای آزمون قدرت فرشته) و برای هر تیمِ
 * ایده‌دار یک ایدهٔ ثبت‌نهایی‌شده می‌سازد، فاز را روی SEED_ROUND می‌گذارد و
 * هستهٔ سرمایه‌گذاری (`investCore`) و هستهٔ قدرت فرشته (`angelInvestCore`) را می‌آزماید.
 * در پایان همهٔ رکوردهای ساخته‌شده پاک و فاز به REGISTRATION برمی‌گردد.
 */

import { createTempDb, isTempDatabaseUrl } from "./lib/temp-db";

// DATABASE_URL باید پیش از import شدن src/lib/db تنظیم شود؛ اگر از قبل به یک
// پایگاه‌دادهٔ موقت اشاره نمی‌کرد، اینجا یکی می‌سازیم تا هرگز به dev.db وصل نشویم.
const ownTempDb = isTempDatabaseUrl(process.env.DATABASE_URL) ? null : createTempDb("invest");

const TAG = `smoke_${Date.now()}`;

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { investCore, angelInvestCore } = await import("../src/lib/invest");
  const { DEFAULTS } = await import("../src/lib/constants");

  async function setPhaseValue(value: string) {
    await prisma.setting.upsert({
      where: { key: "phase" },
      update: { value },
      create: { key: "phase", value },
    });
  }

  const createdUserIds: string[] = [];
  const createdTeamIds: string[] = [];
  const createdIdeaIds: string[] = [];

  const previousPhase = (await prisma.setting.findUnique({ where: { key: "phase" } }))?.value ?? null;

  try {
    // ---------- ساخت داده ----------
    // تیم ۱ و ۲: هرکدام یک ایدهٔ ثبت‌شده. تیم ۳: بدون ایده، فقط برای آزمون قدرت فرشته.
    for (const n of [1, 2, 3]) {
      const team = await prisma.team.create({
        data: { name: `${TAG}_team_${n}`, slug: `${TAG}-team-${n}` },
      });
      createdTeamIds.push(team.id);

      const user = await prisma.user.create({
        data: {
          email: `${TAG}_u${n}@example.test`,
          passwordHash: "x",
          nickname: `کاربر ${n}`,
          role: "DEALMAKER",
          power: n === 3 ? "ANGEL" : "HYPE",
          teamId: team.id,
          seedWallet: 100,
        },
      });
      createdUserIds.push(user.id);

      if (n !== 3) {
        const idea = await prisma.idea.create({
          data: {
            teamId: team.id,
            title: `ایدهٔ ${n}`,
            oneLiner: "یک جملهٔ کوتاه",
            problem: "مسئله",
            audience: "مخاطب",
            buildPlan: "برنامه",
            fundingCap: n === 1 ? 200 : 50, // تیم دوم هدف پایین‌تر برای آزمون عبور از هدف
            revenueShare: 30,
            submittedAt: new Date(),
          },
        });
        createdIdeaIds.push(idea.id);
      }
    }

    const [userA, userB, userC] = createdUserIds; // userC: صاحب قدرت فرشته، بدون ایده
    const [teamA, teamB, teamC] = createdTeamIds;
    const [ideaA, ideaB] = createdIdeaIds;

    await setPhaseValue("SEED_ROUND");

    // ---------- ۱) سرمایه‌گذاری عادی ----------
    const r1 = await investCore(prisma, userA, ideaB, 10);
    check("سرمایه‌گذاری عادی ثبت می‌شود", r1.ok, r1.ok ? "" : r1.error);

    const walletAfter = (await prisma.user.findUniqueOrThrow({ where: { id: userA } })).seedWallet;
    check("کیف بذر کم می‌شود (۱۰۰ → ۹۰)", walletAfter === 90, `seedWallet=${walletAfter}`);

    const treasuryB = (await prisma.team.findUniqueOrThrow({ where: { id: teamB } })).treasury;
    check("خزانهٔ تیم هدف زیاد می‌شود", treasuryB === 10, `treasury=${treasuryB}`);

    const ledger = r1.ok
      ? await prisma.ledgerEntry.findFirst({ where: { refId: r1.investmentId } })
      : null;
    check(
      "رکورد دفتر کل ساخته می‌شود (SEED / -۱۰ / INVEST)",
      !!ledger && ledger.wallet === "SEED" && ledger.delta === -10 && ledger.reason === "INVEST" && ledger.userId === userA,
      ledger ? JSON.stringify({ wallet: ledger.wallet, delta: ledger.delta, reason: ledger.reason }) : "رکوردی یافت نشد"
    );

    // ---------- ۲) سقف هر هدف (۴۰) ----------
    const r2 = await investCore(prisma, userA, ideaB, 31); // ۱۰ + ۳۱ = ۴۱ > ۴۰
    check(
      `سقف ${DEFAULTS.maxPerTarget} سکه روی هر ایده رعایت می‌شود`,
      !r2.ok && r2.error.includes("سقف سرمایه‌گذاری"),
      r2.ok ? "اشتباهاً پذیرفته شد" : r2.error
    );

    // ---------- ۳) کمبود موجودی کیف ----------
    await prisma.user.update({ where: { id: userB }, data: { seedWallet: 5 } });
    const r3 = await investCore(prisma, userB, ideaA, 20);
    check(
      "کمبود موجودی کیف بذر رد می‌شود",
      !r3.ok && r3.error.includes("موجودی کیف بذر"),
      r3.ok ? "اشتباهاً پذیرفته شد" : r3.error
    );
    await prisma.user.update({ where: { id: userB }, data: { seedWallet: 100 } });

    // ---------- ۴) خودتأمینی ممنوع است ----------
    const r4 = await investCore(prisma, userB, ideaB, 5); // userB عضو teamB است، ideaB متعلق به teamB
    check(
      "سرمایه‌گذاری روی ایدهٔ تیم خودت رد می‌شود",
      !r4.ok && r4.error === "نمی‌توانی روی ایدهٔ تیم خودت سرمایه‌گذاری کنی",
      r4.ok ? "اشتباهاً پذیرفته شد" : r4.error
    );

    // ---------- ۵) عبور از «هدف جذب سرمایه» مجاز است ----------
    // ideaB هدفش ۵۰ است و تا اینجا ۱۰ جذب کرده. userA تا سقف ۴۰ خودش شارژ می‌کند (۳۰ بیشتر)،
    // بعد userC هم ۲۰ می‌گذارد تا جمع به ۶۰ (بیشتر از هدف ۵۰) برسد — باید هر دو رد نشوند.
    const r5a = await investCore(prisma, userA, ideaB, 30); // ۱۰+۳۰=۴۰ (سقف شخصی، هنوز زیر هدف)
    check("سرمایه‌گذاری تا سقف شخصی مجاز است", r5a.ok, r5a.ok ? "" : r5a.error);
    const r5b = await investCore(prisma, userC, ideaB, 20); // ۴۰+۲۰=۶۰ > هدف ۵۰
    check(
      "سرمایه‌گذاری‌ای که از هدف جذب سرمایه عبور می‌کند رد نمی‌شود",
      r5b.ok,
      r5b.ok ? "" : r5b.error
    );
    const raisedB = (await prisma.investment.aggregate({ where: { ideaId: ideaB }, _sum: { amount: true } }))._sum.amount ?? 0;
    check("جذب ایده از هدفش عبور کرده", raisedB === 60, `raised=${raisedB} هدف=50`);

    // ---------- ۶) مبلغ نامعتبر ----------
    const r6 = await investCore(prisma, userA, ideaA, 0);
    check("مبلغ صفر رد می‌شود", !r6.ok, r6.ok ? "اشتباهاً پذیرفته شد" : r6.error);

    // ---------- ۷) خارج از فاز ----------
    await setPhaseValue("BUILD");
    const r7 = await investCore(prisma, userA, ideaA, 5);
    check(
      "خارج از دور سرمایه‌گذاری رد می‌شود",
      !r7.ok && r7.error.includes("دور سرمایه‌گذاری"),
      r7.ok ? "اشتباهاً پذیرفته شد" : r7.error
    );
    await setPhaseValue("SEED_ROUND");

    // ---------- ۸) تراکنش اتمی: تلاش ناموفق نباید اثری بگذارد ----------
    const walletBefore = (await prisma.user.findUniqueOrThrow({ where: { id: userB } })).seedWallet;
    await investCore(prisma, userB, ideaB, 5); // خودتأمینی → باید رد شود
    const walletUnchanged = (await prisma.user.findUniqueOrThrow({ where: { id: userB } })).seedWallet;
    check("تلاش ناموفق کیف پول را تغییر نمی‌دهد", walletBefore === walletUnchanged, `${walletBefore} → ${walletUnchanged}`);

    // ---------- ۹) قدرت فرشته: سرمایه‌گذاری اتمی ۲۰ سکه‌ای روی کم‌سرمایه‌ترین ایدهٔ تیم دیگر ----------
    // در این مرحله ideaA هنوز ۰ جذب کرده و ideaB شصت‌تا؛ پس کم‌سرمایه‌ترین ideaA است.
    const userCWalletBefore = (await prisma.user.findUniqueOrThrow({ where: { id: userC } })).seedWallet;
    const treasuryABefore = (await prisma.team.findUniqueOrThrow({ where: { id: teamA } })).treasury;

    const rAngel = await angelInvestCore(prisma, userC);
    check("قدرت فرشته با موفقیت اجرا می‌شود", rAngel.ok, rAngel.ok ? "" : rAngel.error);
    check(
      "قدرت فرشته دقیقاً روی کم‌سرمایه‌ترین ایده (ideaA) می‌نشیند",
      rAngel.ok && rAngel.ideaId === ideaA,
      rAngel.ok ? `ideaId=${rAngel.ideaId}` : ""
    );

    const angelInvestment = rAngel.ok
      ? await prisma.investment.findUnique({ where: { id: rAngel.investmentId } })
      : null;
    check(
      "سرمایه‌گذاری فرشته با مبلغ درست و selfFunded=false ثبت شد",
      !!angelInvestment && angelInvestment.amount === DEFAULTS.angelBonus && angelInvestment.selfFunded === false && angelInvestment.userId === userC,
      angelInvestment ? JSON.stringify(angelInvestment) : "یافت نشد"
    );

    const userCWalletAfter = (await prisma.user.findUniqueOrThrow({ where: { id: userC } })).seedWallet;
    check(
      "کیف بذر کاربر با قدرت فرشته تغییر نمی‌کند (سکه از هیچ ساخته می‌شود)",
      userCWalletAfter === userCWalletBefore,
      `${userCWalletBefore} → ${userCWalletAfter}`
    );

    const treasuryAAfter = (await prisma.team.findUniqueOrThrow({ where: { id: teamA } })).treasury;
    check(
      `خزانهٔ تیم گیرنده به‌اندازهٔ ${DEFAULTS.angelBonus} سکه زیاد می‌شود`,
      treasuryAAfter === treasuryABefore + DEFAULTS.angelBonus,
      `${treasuryABefore} → ${treasuryAAfter}`
    );

    const angelLedgers = rAngel.ok
      ? await prisma.ledgerEntry.findMany({ where: { refId: rAngel.investmentId }, orderBy: { delta: "desc" } })
      : [];
    check(
      "دو سطر دفتر کل SEED (+۲۰ POWER_ANGEL و −۲۰ INVEST) و یک سطر TREASURY (+۲۰ INVEST) ساخته شد",
      angelLedgers.length === 3 &&
        angelLedgers.some((l) => l.wallet === "SEED" && l.delta === DEFAULTS.angelBonus && l.reason === "POWER_ANGEL") &&
        angelLedgers.some((l) => l.wallet === "SEED" && l.delta === -DEFAULTS.angelBonus && l.reason === "INVEST") &&
        angelLedgers.some((l) => l.wallet === "TREASURY" && l.delta === DEFAULTS.angelBonus && l.reason === "INVEST"),
      JSON.stringify(angelLedgers.map((l) => ({ wallet: l.wallet, delta: l.delta, reason: l.reason })))
    );

    const userCAfter = await prisma.user.findUniqueOrThrow({ where: { id: userC } });
    check("powerUsed کاربر فرشته true شد", userCAfter.powerUsed === true, `powerUsed=${userCAfter.powerUsed}`);

    const rAngelAgain = await angelInvestCore(prisma, userC);
    check("استفادهٔ دوباره از قدرت فرشته رد می‌شود", !rAngelAgain.ok, rAngelAgain.ok ? "اشتباهاً پذیرفته شد" : rAngelAgain.error);

    void teamC;
  } finally {
    // ---------- پاک‌سازی ----------
    await prisma.ledgerEntry.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.dueDiligenceMessage.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.investment.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.idea.deleteMany({ where: { id: { in: createdIdeaIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.team.deleteMany({ where: { id: { in: createdTeamIds } } });
    await setPhaseValue(previousPhase ?? "REGISTRATION");
    console.log(`\nپاک‌سازی انجام شد؛ فاز به ${previousPhase ?? "REGISTRATION"} بازگشت.`);
  }

  console.log(`\nنتیجه: ${passed} PASS / ${failed} FAIL`);
  await prisma.$disconnect();
  return failed;
}

main()
  .then((failed) => {
    ownTempDb?.cleanup();
    process.exitCode = failed > 0 ? 1 : 0;
  })
  .catch((e) => {
    console.error(e);
    ownTempDb?.cleanup();
    process.exitCode = 1;
  });
