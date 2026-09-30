/**
 * دود-تست قدرت «سپر» (بیمهٔ یک سرمایه‌گذاری).
 * اجرا: npx tsx scripts/smoke-shield.ts
 *
 * روی یک پایگاه‌دادهٔ موقت کار می‌کند (هرگز dev.db). سناریو:
 *   - انتخاب فقط در SEED_ROUND/BUILD مجاز است؛
 *   - فقط دارندهٔ سپر، فقط روی تیم دیگری که واقعاً رویش سرمایه‌گذاری کرده؛
 *   - انتخاب برگشت‌ناپذیر است و دو درخواست هم‌زمان فقط یک هدف ثبت می‌کنند؛
 *   - در امتیازدهی و بعد از تسویه فقط همان جفت (کاربر، تیم) نصف مبلغ اعتبار پرتفوی می‌گیرد،
 *     حتی وقتی سودش صفر است؛
 *   - یادآور سپر (src/lib/shield-reminders.ts) فقط به دارندگان بی‌انتخاب و برای هر رویداد
 *     (پایان SEED_ROUND، شروع BUILD، پایان BUILD) دقیقاً یک‌بار می‌رسد.
 */

import { createTempDb, isTempDatabaseUrl } from "./lib/temp-db";

// DATABASE_URL باید پیش از import شدن src/lib/db تنظیم شود؛ اگر از قبل به یک
// پایگاه‌دادهٔ موقت اشاره نمی‌کرد، اینجا یکی می‌سازیم تا هرگز به dev.db وصل نشویم.
const ownTempDb = isTempDatabaseUrl(process.env.DATABASE_URL) ? null : createTempDb("shield");

const TAG = `smoke_shield_${Date.now()}`;

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
  const { chooseShieldTarget, shieldCandidates } = await import("../src/lib/shield");
  const { computeScores } = await import("../src/lib/scoring");
  const { settleGame, loadSettledOutput } = await import("../src/lib/settlement");

  async function setPhaseValue(value: string) {
    await prisma.setting.upsert({ where: { key: "phase" }, update: { value }, create: { key: "phase", value } });
  }

  // ---------- ساخت داده: چهار تیم با ایدهٔ ثبت‌شده ----------
  const teams: { id: string; ideaId: string }[] = [];
  for (const n of [1, 2, 3, 4]) {
    const team = await prisma.team.create({ data: { name: `${TAG}_team_${n}`, slug: `${TAG}-team-${n}` } });
    const idea = await prisma.idea.create({
      data: {
        teamId: team.id,
        title: `ایدهٔ ${n}`,
        oneLiner: "یک جملهٔ کوتاه",
        problem: "مسئله",
        audience: "مخاطب",
        buildPlan: "برنامه",
        fundingCap: 200,
        revenueShare: 30,
        submittedAt: new Date(),
      },
    });
    teams.push({ id: team.id, ideaId: idea.id });
  }
  const [tA, tB, tC, tD] = teams;

  async function makeUser(key: string, power: string, teamId: string) {
    return prisma.user.create({
      data: { email: `${TAG}_${key}@example.test`, passwordHash: "x", nickname: key, role: "DEALMAKER", power, teamId, seedWallet: 100 },
    });
  }
  const shieldUser = await makeUser("s1", "SHIELD", tA.id); // سپردار اصلی، عضو تیم A
  const racer = await makeUser("s2", "SHIELD", tD.id); // سپردار دوم برای آزمون هم‌زمانی
  const plain = await makeUser("h1", "HYPE", tB.id); // بدون سپر

  await setPhaseValue("SEED_ROUND");
  const inv = [
    await investCore(prisma, shieldUser.id, tB.ideaId, 40),
    await investCore(prisma, shieldUser.id, tC.ideaId, 10),
    await investCore(prisma, racer.id, tB.ideaId, 20),
    await investCore(prisma, racer.id, tC.ideaId, 20),
    await investCore(prisma, plain.id, tC.ideaId, 30),
  ];
  check("سرمایه‌گذاری‌های پایه ثبت شدند", inv.every((r) => r.ok), JSON.stringify(inv.filter((r) => !r.ok)));

  // ---------- ۱) فاز ----------
  for (const phase of ["REGISTRATION", "IDEATION", "MARKET", "AUCTION", "CLOSED"]) {
    await setPhaseValue(phase);
    const r = await chooseShieldTarget(shieldUser.id, tB.id);
    check(`در فاز ${phase} انتخاب سپر رد می‌شود`, !r.ok, r.ok ? "اشتباهاً پذیرفته شد" : r.error);
  }
  const afterPhaseChecks = await prisma.user.findUniqueOrThrow({ where: { id: shieldUser.id } });
  check(
    "رد شدن در فاز غیرمجاز چیزی ثبت نمی‌کند",
    afterPhaseChecks.powerUsed === false && afterPhaseChecks.shieldTeamId === null,
    JSON.stringify({ powerUsed: afterPhaseChecks.powerUsed, shieldTeamId: afterPhaseChecks.shieldTeamId })
  );

  await setPhaseValue("BUILD");

  // ---------- ۲) واجد شرایط بودن ----------
  const rOwn = await chooseShieldTarget(shieldUser.id, tA.id);
  check("سپر روی تیم خودت رد می‌شود", !rOwn.ok, rOwn.ok ? "اشتباهاً پذیرفته شد" : rOwn.error);

  const rNone = await chooseShieldTarget(shieldUser.id, tD.id);
  check("سپر روی تیمی که رویش سرمایه‌گذاری نکرده‌ای رد می‌شود", !rNone.ok, rNone.ok ? "اشتباهاً پذیرفته شد" : rNone.error);

  const rMissing = await chooseShieldTarget(shieldUser.id, "no-such-team");
  check("شناسهٔ تیم نامعتبر رد می‌شود", !rMissing.ok, rMissing.ok ? "اشتباهاً پذیرفته شد" : rMissing.error);

  const rPlain = await chooseShieldTarget(plain.id, tC.id);
  check("کاربر بدون قدرت سپر نمی‌تواند سپر انتخاب کند", !rPlain.ok, rPlain.ok ? "اشتباهاً پذیرفته شد" : rPlain.error);

  const candidates = await shieldCandidates(shieldUser.id);
  check(
    "فهرست گزینه‌ها فقط سرمایه‌گذاری‌های روی تیم‌های دیگر است (B=۴۰، C=۱۰)",
    candidates.length === 2 &&
      candidates[0].teamId === tB.id && candidates[0].invested === 40 &&
      candidates[1].teamId === tC.id && candidates[1].invested === 10,
    JSON.stringify(candidates)
  );

  // ---------- ۳) انتخاب موفق و برگشت‌ناپذیری ----------
  const rOk = await chooseShieldTarget(shieldUser.id, tB.id);
  check("انتخاب سپر روی تیم B در فاز BUILD موفق است", rOk.ok && rOk.invested === 40, rOk.ok ? "" : rOk.error);

  const chosen = await prisma.user.findUniqueOrThrow({ where: { id: shieldUser.id } });
  check("powerUsed=true و shieldTeamId=B ثبت شد", chosen.powerUsed === true && chosen.shieldTeamId === tB.id,
    JSON.stringify({ powerUsed: chosen.powerUsed, shieldTeamId: chosen.shieldTeamId }));

  const rAgain = await chooseShieldTarget(shieldUser.id, tC.id);
  const stillB = await prisma.user.findUniqueOrThrow({ where: { id: shieldUser.id } });
  check("انتخاب دوباره (حتی روی تیم دیگر) رد می‌شود", !rAgain.ok, rAgain.ok ? "اشتباهاً پذیرفته شد" : rAgain.error);
  check("هدف سپر بعد از تلاش دوباره همچنان B است", stillB.shieldTeamId === tB.id, `shieldTeamId=${stillB.shieldTeamId}`);

  // ---------- ۴) هم‌زمانی: دو درخواست هم‌زمان فقط یک هدف ثبت می‌کنند ----------
  const race = await Promise.all([chooseShieldTarget(racer.id, tB.id), chooseShieldTarget(racer.id, tC.id)]);
  const racerAfter = await prisma.user.findUniqueOrThrow({ where: { id: racer.id } });
  const winners = race.filter((r) => r.ok);
  check("از دو درخواست هم‌زمان دقیقاً یکی موفق است", winners.length === 1, JSON.stringify(race));
  check(
    "هدف ثبت‌شده همانی است که درخواست موفق گفته",
    winners.length === 1 && winners[0].ok && racerAfter.shieldTeamId === winners[0].teamId,
    `shieldTeamId=${racerAfter.shieldTeamId}`
  );

  // ---------- ۵) امتیازدهی: فقط جفت انتخاب‌شده، حتی با سود صفر ----------
  // هیچ فروشی ثبت نشده، پس همهٔ سودها صفر است؛ سپر نباید سکه‌ای جابه‌جا کند.
  const out = await computeScores();
  const lineB = out.dividends.find((d) => d.userId === shieldUser.id && d.teamId === tB.id);
  const lineC = out.dividends.find((d) => d.userId === shieldUser.id && d.teamId === tC.id);
  check("جفت بیمه‌شده با سود صفر اعتبار floor(40×0.5)=۲۰ می‌گیرد", lineB?.dividend === 0 && lineB?.portfolioCredit === 20, JSON.stringify(lineB));
  check("سرمایه‌گذاری بیمه‌نشدهٔ همان کاربر (C) اعتبار ۰ می‌گیرد", lineC?.portfolioCredit === 0, JSON.stringify(lineC));
  const plainLine = out.dividends.find((d) => d.userId === plain.id);
  check("کاربر بدون سپر اثری نمی‌گیرد", plainLine?.portfolioCredit === 0, JSON.stringify(plainLine));
  const portfolioA = out.teams.find((t) => t.teamId === tA.id)?.portfolio;
  check("پرتفوی تیم A (تیم سپردار) = ۲۰", portfolioA === 20, `portfolio=${portfolioA}`);

  // ---------- ۶) بعد از تسویه: بازسازی از دفتر کل هم همان اعتبار را می‌دهد ----------
  await setPhaseValue("CLOSED");
  const settled = await settleGame();
  check("تسویه انجام شد و سودی پرداخت نشد", !settled.alreadySettled && settled.dividendsPaid === 0, JSON.stringify(settled));
  const loaded = await loadSettledOutput();
  const loadedB = loaded.dividends.find((d) => d.userId === shieldUser.id && d.teamId === tB.id);
  check(
    "loadSettledOutput جفت بیمه‌شدهٔ بدون سطر سود را با اعتبار ۲۰ برمی‌گرداند",
    loadedB?.dividend === 0 && loadedB?.portfolioCredit === 20 && loadedB?.invested === 40,
    JSON.stringify(loadedB)
  );
  check(
    "loadSettledOutput برای جفت‌های بیمه‌نشده سطر ساختگی نمی‌سازد",
    !loaded.dividends.some((d) => d.userId === shieldUser.id && d.teamId === tC.id),
    JSON.stringify(loaded.dividends)
  );
  const settledA = loaded.teams.find((t) => t.teamId === tA.id)?.portfolio;
  check("پرتفوی ثبت‌شدهٔ تیم A بعد از تسویه = ۲۰", settledA === 20, `portfolio=${settledA}`);

  // ---------- ۷) یادآور یک‌بارهٔ سپر برای دارندگانی که هنوز انتخاب نکرده‌اند ----------
  const { setPhase } = await import("../src/lib/phase");
  const { transitionTo } = await import("../src/lib/phase-transition");
  const { runShieldReminders, resetShieldReminders, SHIELD_REMINDER_KIND } = await import("../src/lib/shield-reminders");

  // r1: سپردار با سرمایه‌گذاری واجد شرایط؛ r2: سپردار بدون هیچ سرمایه‌گذاری؛
  // r3: سپردار فقط با سرمایه‌گذاری روی تیم خودش (واجد شرایط نیست).
  // shieldUser و racer قبلاً انتخاب کرده‌اند و plain اصلاً سپر ندارد → هرگز یادآور نمی‌گیرند.
  const r1 = await makeUser("r1", "SHIELD", tD.id);
  const r2 = await makeUser("r2", "SHIELD", tC.id);
  const r3 = await makeUser("r3", "SHIELD", tB.id);
  await prisma.investment.create({ data: { userId: r1.id, ideaId: tC.ideaId, amount: 10 } });
  await prisma.investment.create({ data: { userId: r3.id, ideaId: tB.ideaId, amount: 10, selfFunded: true } });

  async function reminders(userId: string) {
    return prisma.notification.findMany({ where: { userId, kind: SHIELD_REMINDER_KIND }, orderBy: { createdAt: "asc" } });
  }
  async function counts() {
    const ids = { r1: r1.id, r2: r2.id, r3: r3.id, chosen: shieldUser.id, racer: racer.id, plain: plain.id };
    const out: Record<string, number> = {};
    for (const [k, id] of Object.entries(ids)) out[k] = (await reminders(id)).length;
    return out;
  }
  const inMin = (m: number) => new Date(Date.now() + m * 60_000);

  await resetShieldReminders();

  // الف) SEED_ROUND با زمان زیاد باقی‌مانده: هنوز یادآوری نیست
  await setPhase("SEED_ROUND", inMin(24 * 60));
  await runShieldReminders();
  let c = await counts();
  check("SEED_ROUND دور از پایان: هیچ یادآوری ارسال نمی‌شود", Object.values(c).every((n) => n === 0), JSON.stringify(c));

  // ب) ۱۰ دقیقه تا پایان SEED_ROUND: هر دارندهٔ بی‌انتخاب دقیقاً یکی، حتی با تیک‌های تکراری/هم‌زمان
  await setPhase("SEED_ROUND", inMin(10));
  await runShieldReminders();
  await runShieldReminders();
  await Promise.all([runShieldReminders(), runShieldReminders(), runShieldReminders()]);
  c = await counts();
  check(
    "پایان SEED_ROUND: r1/r2/r3 هرکدام دقیقاً یک یادآور؛ انتخاب‌کرده‌ها و بی‌سپر هیچ",
    c.r1 === 1 && c.r2 === 1 && c.r3 === 1 && c.chosen === 0 && c.racer === 0 && c.plain === 0,
    JSON.stringify(c)
  );
  const [r1Seed] = await reminders(r1.id);
  const [r2Seed] = await reminders(r2.id);
  const [r3Seed] = await reminders(r3.id);
  check("یادآور دارندهٔ واجد شرایط به کیف پول می‌رود", r1Seed?.href === "/wallet" && r1Seed.title === "سپرت را فعال کن 🛡️", JSON.stringify(r1Seed));
  check(
    "دارندهٔ بدون سرمایه‌گذاری واجد شرایط (هیچ / فقط تیم خودش) به سرمایه‌گذاری دعوت می‌شود",
    r2Seed?.href === "/invest" && r3Seed?.href === "/invest",
    JSON.stringify([r2Seed?.href, r3Seed?.href])
  );

  // ج) ورود به BUILD (از مسیر transitionTo): فقط دارندهٔ واجد شرایط، یک‌بار
  await transitionTo("BUILD", inMin(48 * 60));
  await runShieldReminders();
  await runShieldReminders();
  c = await counts();
  check(
    "شروع BUILD: r1 یک یادآور تازه (جمعاً ۲)؛ r2/r3 که دیگر نمی‌توانند سرمایه‌گذاری کنند چیزی نمی‌گیرند",
    c.r1 === 2 && c.r2 === 1 && c.r3 === 1 && c.chosen === 0 && c.racer === 0 && c.plain === 0,
    JSON.stringify(c)
  );

  // د) ۱۰ دقیقه تا پایان BUILD: آخرین یادآور، یک‌بار
  await setPhase("BUILD", inMin(10));
  await runShieldReminders();
  await Promise.all([runShieldReminders(), runShieldReminders()]);
  c = await counts();
  check(
    "پایان BUILD: r1 دقیقاً یک یادآور دیگر (جمعاً ۳)، بقیه بدون تغییر",
    c.r1 === 3 && c.r2 === 1 && c.r3 === 1 && c.chosen === 0 && c.racer === 0 && c.plain === 0,
    JSON.stringify(c)
  );

  // هـ) بعد از انتخاب، حتی با پرچم‌های پاک‌شده هم یادآوری نمی‌رسد
  const r1Choice = await chooseShieldTarget(r1.id, tC.id);
  check("r1 در BUILD سپر را انتخاب می‌کند", r1Choice.ok, r1Choice.ok ? "" : r1Choice.error);
  await resetShieldReminders();
  await runShieldReminders();
  c = await counts();
  check("بعد از انتخاب r1 یادآور تازه‌ای نمی‌گیرد", c.r1 === 3, JSON.stringify(c));

  // و) BUILD کوتاه‌تر از پنجرهٔ یادآور: فقط یک اعلان «رو به پایان»، نه دو اعلان پشت‌سرهم
  const r4 = await makeUser("r4", "SHIELD", tD.id);
  await prisma.investment.create({ data: { userId: r4.id, ideaId: tB.ideaId, amount: 5 } });
  await resetShieldReminders();
  await transitionTo("BUILD", inMin(10));
  await runShieldReminders();
  const r4List = await reminders(r4.id);
  check("BUILD کوتاه: دارنده فقط یک یادآور می‌گیرد", r4List.length === 1, JSON.stringify(r4List.map((n) => n.body)));

  // ز) خارج از فازهای مجاز چیزی ارسال نمی‌شود؛ برگشت به IDEATION پرچم‌ها را پاک می‌کند
  const before = await prisma.notification.count({ where: { kind: SHIELD_REMINDER_KIND } });
  await resetShieldReminders();
  await setPhase("MARKET", inMin(10));
  await runShieldReminders();
  const afterMarket = await prisma.notification.count({ where: { kind: SHIELD_REMINDER_KIND } });
  check("در MARKET هیچ یادآور سپری ارسال نمی‌شود", afterMarket === before, `${before} → ${afterMarket}`);
  await setPhase("BUILD", inMin(10));
  await runShieldReminders(); // r4 دوباره (پرچم پاک شده بود) → پرچم‌ها ساخته می‌شوند
  await transitionTo("IDEATION", null);
  const flagsLeft = await prisma.setting.count({ where: { key: { startsWith: "shield_reminder:" } } });
  check("transitionTo(IDEATION) پرچم‌های یادآور را پاک می‌کند", flagsLeft === 0, `flags=${flagsLeft}`);

  console.log(`\nنتیجه: ${passed} PASS / ${failed} FAIL`);
  await prisma.$disconnect();
  return failed;
}

main()
  .then((failedCount) => {
    ownTempDb?.cleanup();
    process.exitCode = failedCount > 0 ? 1 : 0;
  })
  .catch((e) => {
    console.error(e);
    ownTempDb?.cleanup();
    process.exitCode = 1;
  });
