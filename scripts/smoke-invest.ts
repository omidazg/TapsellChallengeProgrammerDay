/**
 * تست دودی منطق سرمایه‌گذاری.
 * اجرا: npx tsx scripts/smoke-invest.ts
 *
 * دو تیم × دو کاربر و برای هر تیم یک ایدهٔ ثبت‌نهایی‌شده می‌سازد، فاز را روی
 * SEED_ROUND می‌گذارد و هستهٔ سرمایه‌گذاری (`investCore`) را می‌آزماید.
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
  const { investCore } = await import("../src/lib/invest");
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
    for (const n of [1, 2]) {
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
          power: "HYPE",
          teamId: team.id,
          seedWallet: 100,
        },
      });
      createdUserIds.push(user.id);

      const idea = await prisma.idea.create({
        data: {
          teamId: team.id,
          title: `ایدهٔ ${n}`,
          oneLiner: "یک جملهٔ کوتاه",
          problem: "مسئله",
          audience: "مخاطب",
          buildPlan: "برنامه",
          fundingCap: n === 1 ? 200 : 50, // تیم دوم سقف پایین برای آزمون سقف جذب
          revenueShare: 30,
          submittedAt: new Date(),
        },
      });
      createdIdeaIds.push(idea.id);
    }

    const [userA, userB] = createdUserIds;
    const [teamA, teamB] = createdTeamIds;
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

    // ---------- ۴) سقف جذب سرمایهٔ ایده ----------
    // ایدهٔ B سقف ۵۰ دارد و تا اینجا ۱۰ جذب کرده؛ ۴۰ دیگر یعنی ۵۰ (مجاز) و بیشتر از آن رد.
    const r4a = await investCore(prisma, userB, ideaB, 40); // خودتأمین، ۱۰+۴۰ = ۵۰ = سقف
    check("سرمایه‌گذاری تا دقیقاً سقف جذب مجاز است", r4a.ok, r4a.ok ? "" : r4a.error);

    const r4b = await investCore(prisma, userA, ideaB, 1); // ۵۰ + ۱ > ۵۰
    check(
      "عبور از سقف جذب سرمایهٔ ایده رد می‌شود",
      !r4b.ok && r4b.error === "سقف جذب سرمایهٔ این ایده پر شده است",
      r4b.ok ? "اشتباهاً پذیرفته شد" : r4b.error
    );

    // ---------- ۵) پرچم خودتأمین ----------
    check("سرمایه‌گذاری روی تیم خودی با پرچم selfFunded ثبت می‌شود", r4a.ok && r4a.selfFunded === true);
    check("سرمایه‌گذاری روی تیم دیگر selfFunded ندارد", r1.ok && r1.selfFunded === false);

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
    const walletBefore = (await prisma.user.findUniqueOrThrow({ where: { id: userA } })).seedWallet;
    await investCore(prisma, userA, ideaB, 5); // سقف جذب پر است → باید رد شود
    const walletUnchanged = (await prisma.user.findUniqueOrThrow({ where: { id: userA } })).seedWallet;
    check("تلاش ناموفق کیف پول را تغییر نمی‌دهد", walletBefore === walletUnchanged, `${walletBefore} → ${walletUnchanged}`);

    void teamA;
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
