/**
 * دود-تست امتیازدهی سه‌معیاره (داوری انسانی ۵۰۰ + حمایت مردمی ۳۰۰ + داوری هوش مصنوعی ۲۰۰).
 * اجرا: npx tsx scripts/smoke-scoring.ts
 *
 * روی یک پایگاه‌دادهٔ SQLite موقت (createTempDb) چهار تیم می‌سازد:
 *   آلفا (۳ نفر، کسر تقلب ۲۰)، بتا (۲ نفر)، گاما (شرکت فردی، ۱ نفر) و دلتا (۲ نفر، فقط ایده)
 * و چند حامی بی‌تیم که از ایده‌ها حمایت می‌کنند و محصولات را می‌خرند. سپس خروجی
 * computeScores / computeAwards / معیار عمومی سالن (تعداد حامی) و detectAndFlagCollusion را
 * با مقادیری که دستی از فرمول‌ها حساب شده‌اند می‌سنجد.
 */

import { createTempDb, type TempDb } from "./lib/temp-db";
import { createRequire } from "node:module";
import path from "node:path";

// اگر ماژولی پکیج `server-only` را import کند بیرون از Next خطا می‌دهد؛
// آن را با یک ماژول خالی در کش require جایگزین می‌کنیم.
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
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

async function main() {
  tempDb = createTempDb("smoke-scoring");

  const { prisma } = await import("../src/lib/db");
  const { computeScores, computeAwards } = await import("../src/lib/scoring");
  const { peopleSupport, juryRawScore, scoreGame, defaultConfig } = await import("../src/lib/economy/engine");
  const { detectAndFlagCollusion } = await import("../src/lib/admin");
  const { setPhase } = await import("../src/lib/phase");
  const { invalidate } = await import("../src/lib/ttl-cache");
  const { getHallPayloadCached } = await import("../src/lib/hall");
  const { SCORE_WEIGHTS, DEFAULTS } = await import("../src/lib/constants");

  try {
    // ---------- موتور خالص ----------
    check("جمع وزن سه معیار = ۱۰۰۰", SCORE_WEIGHTS.jury + SCORE_WEIGHTS.people + SCORE_WEIGHTS.ai === 1000);
    {
      // شعار بازی: «۱۰ نفر که هر کدام ۱۰ سکه بدهند، ۱۰ برابرِ یک نفر با ۱۰۰ سکه می‌ارزند.»
      const many = peopleSupport(Array.from({ length: 10 }, (_, i) => ({ userId: `u${i}`, amount: 10 })), 1000);
      const one = peopleSupport([{ userId: "whale", amount: 100 }], 1000);
      check("فرمول درجه‌دو: ۱۰×۱۰ سکه = ۱۰ برابر ۱×۱۰۰ سکه (بدون سقف)", near(many.score, 10 * one.score), `${many.score} vs ${one.score}`);
      const capped = peopleSupport([{ userId: "whale", amount: 100 }], DEFAULTS.supportCap);
      check("سقف اثر هر نفر (support_cap=۵۰): ۱۰۰ سکهٔ یک نفر = ۵۰", near(capped.score, 50), `=${capped.score}`);
      const excluded = peopleSupport([{ userId: "m", amount: 30 }, { userId: "x", amount: 9 }], 50, new Set(["m"]));
      check("سکهٔ اعضای خود تیم حساب نمی‌شود", near(excluded.score, 9) && excluded.supporters === 1 && excluded.coins === 9, JSON.stringify(excluded));
      check("داوری: میانگین سه پرسش × ۱۰", juryRawScore({ works: 9, value: 8, pitch: 7 }) === 80);
      check("داوری: پرسش بی‌نمره کنار می‌رود", juryRawScore({ works: 6, value: null, pitch: 8 }) === 70);
      check("داوری: بدون نمره → null", juryRawScore({ works: null, value: null, pitch: null }) === null && juryRawScore(null) === null);
      // تعداد اعضای تیم در امتیاز هیچ اثری ندارد: ورودی یکسان با ۱ و ۳ عضو → امتیاز یکسان
      const same = { supports: [{ userId: "fan", amount: 20 }], jury: { works: 8, value: 7, pitch: 6 }, aiQuality: 70, cheatPenalty: 0 };
      const sized = scoreGame(defaultConfig(), [
        { teamId: "one", memberIds: ["o1"], ...same },
        { teamId: "three", memberIds: ["t1", "t2", "t3"], ...same },
      ]);
      const [soloT, trioT] = ["one", "three"].map((id) => sized.teams.find((t) => t.teamId === id)!);
      check(
        "اندازهٔ تیم بی‌اثر: تیم ۱ و ۳ نفره با ورودی یکسان امتیاز یکسان می‌گیرند",
        soloT.juryAdjusted === trioT.juryAdjusted && soloT.total === trioT.total && JSON.stringify(soloT.pts) === JSON.stringify(trioT.pts),
        `${soloT.total}/${trioT.total}`
      );
    }

    // ---------- چیدمان ----------
    let n = 0;
    const mkUser = async (key: string, teamId: string | null) =>
      prisma.user.create({
        data: {
          email: `scoring-${key}-${n++}@example.test`,
          passwordHash: "x",
          nickname: `کاربر ${key}`,
          role: "BUILDER",
          power: "",
          teamId,
          seedWallet: 0,
          buyWallet: 200,
        },
      });
    const mkIdea = async (teamId: string, title: string) =>
      prisma.idea.create({
        data: {
          teamId,
          title,
          oneLiner: "یک خطی",
          problem: "مسئله",
          audience: "مخاطب",
          buildPlan: "برنامهٔ ساخت",
          fundingCap: 0,
          revenueShare: 0,
          submittedAt: new Date(),
        },
      });

    const alpha = await prisma.team.create({ data: { name: "تیم آلفا", slug: "smoke-alpha", cheatPenalty: 20, cheatNote: "آزمون" } });
    const beta = await prisma.team.create({ data: { name: "تیم بتا", slug: "smoke-beta" } });
    const gamma = await prisma.team.create({ data: { name: "شرکت فردی گاما", slug: "smoke-gamma", solo: true } });
    const delta = await prisma.team.create({ data: { name: "تیم دلتا", slug: "smoke-delta" } });

    const a0 = await mkUser("a0", alpha.id);
    const a1 = await mkUser("a1", alpha.id);
    const a2 = await mkUser("a2", alpha.id);
    const b0 = await mkUser("b0", beta.id);
    await mkUser("b1", beta.id);
    await mkUser("g0", gamma.id);
    await mkUser("d0", delta.id);
    await mkUser("d1", delta.id);
    const s = await Promise.all([0, 1, 2, 3, 4].map((i) => mkUser(`s${i}`, null)));

    const ideaAlpha = await mkIdea(alpha.id, "ایدهٔ آلفا");
    const ideaBeta = await mkIdea(beta.id, "ایدهٔ بتا");
    const ideaGamma = await mkIdea(gamma.id, "ایدهٔ گاما");
    const ideaDelta = await mkIdea(delta.id, "ایدهٔ دلتا");

    const mkProduct = (teamId: string, name: string, jury: [number, number, number], aiQuality: number | null) =>
      prisma.product.create({
        data: {
          teamId,
          name,
          price: 10,
          submittedAt: new Date(),
          juryWorks: jury[0],
          juryValue: jury[1],
          juryPitch: jury[2],
          aiQuality,
        },
      });
    const pAlpha = await mkProduct(alpha.id, "محصول آلفا", [9, 8, 7], 60);
    const pBeta = await mkProduct(beta.id, "محصول بتا", [8, 8, 8], 80);
    const pGamma = await mkProduct(gamma.id, "محصول گاما", [7, 7, 7], null);
    // دلتا محصولی ثبت نکرده: داوری null، هوش مصنوعی null

    const support = (ideaId: string, userId: string, amount: number, selfFunded = false) =>
      prisma.investment.create({ data: { ideaId, userId, amount, selfFunded } });
    const buy = (productId: string, userId: string, amount: number) =>
      prisma.purchase.create({ data: { productId, userId, amount } });

    // آلفا: s0 در مجموع ۱۰۰ سکه (حمایت ۶۰ + خرید ۴۰) → با سقف ۵۰ فقط ۵۰ حساب می‌شود.
    //       حمایت خودیِ قدیمی a0 و خرید a1 از محصول تیم خودش حساب نمی‌شوند.
    await support(ideaAlpha.id, s[0].id, 60);
    await buy(pAlpha.id, s[0].id, 40);
    await support(ideaAlpha.id, a0.id, 20, true);
    await buy(pAlpha.id, a1.id, 20);
    // بتا: چهار حامی هر کدام ۱۰ سکه → (۴√۱۰)² = ۱۶۰
    await support(ideaBeta.id, s[1].id, 10);
    await support(ideaBeta.id, s[2].id, 10);
    await buy(pBeta.id, s[3].id, 10);
    await buy(pBeta.id, s[4].id, 10);
    // گاما: دو حامی هر کدام ۲۵ → (۵+۵)² = ۱۰۰
    await support(ideaGamma.id, s[0].id, 25);
    await buy(pGamma.id, s[1].id, 25);
    // دلتا: یک حامی ۱۰ → ۱۰
    await support(ideaDelta.id, s[2].id, 10);

    await setPhase("MARKET", null);

    // ---------- امتیازدهی ----------
    const output = await computeScores();
    const byTeam = new Map(output.teams.map((t) => [t.teamId, t]));
    const A = byTeam.get(alpha.id)!;
    const B = byTeam.get(beta.id)!;
    const G = byTeam.get(gamma.id)!;
    const D = byTeam.get(delta.id)!;
    check("هر چهار تیم امتیاز گرفتند", output.teams.length === 4, `تعداد=${output.teams.length}`);

    // اندازهٔ تیم در امتیاز داوری اثری ندارد
    check("تعداد اعضا: ۳ / ۲ / ۱ / ۲", A.memberCount === 3 && B.memberCount === 2 && G.memberCount === 1 && D.memberCount === 2);
    check("داوری آلفا = ۸۰", A.juryRaw === 80 && A.juryAdjusted === 80, `${A.juryRaw}/${A.juryAdjusted}`);
    check("داوری بتا = ۸۰", B.juryRaw === 80 && B.juryAdjusted === 80, `${B.juryRaw}/${B.juryAdjusted}`);
    check("داوری گاما (فردی) = همان ۷۰، بدون هیچ افزایشی", G.juryRaw === 70 && G.juryAdjusted === 70, `${G.juryRaw}/${G.juryAdjusted}`);
    check("آلفا (۳ نفر) و بتا (۲ نفر) با داوری یکسان، امتیاز داوری یکسان", near(A.pts.jury, B.pts.jury), `${A.pts.jury}/${B.pts.jury}`);
    check("دلتا بی‌محصول: داوری null و صفر", D.juryRaw === null && D.juryAdjusted === 0, `${D.juryRaw}/${D.juryAdjusted}`);

    // حمایت مردمی
    check("حمایت مردمی آلفا = ۵۰ (سقف هر نفر؛ خودی‌ها کنار رفتند)", near(A.people, 50), `=${A.people}`);
    check("حامیان آلفا = ۱، سکهٔ دریافتی = ۱۰۰", A.supporters === 1 && A.coinsReceived === 100, `${A.supporters}/${A.coinsReceived}`);
    check("حمایت مردمی بتا = ۱۶۰ (۴ حامی × ۱۰)", near(B.people, 160) && B.supporters === 4 && B.coinsReceived === 40, `${B.people}/${B.supporters}`);
    check("حمایت مردمی گاما = ۱۰۰", near(G.people, 100) && G.supporters === 2 && G.coinsReceived === 50, `${G.people}/${G.supporters}`);
    check("حمایت مردمی دلتا = ۱۰", near(D.people, 10) && D.supporters === 1, `${D.people}/${D.supporters}`);

    // هوش مصنوعی
    check("داوری هوش مصنوعی: ۶۰ / ۸۰ / null / null", A.ai === 60 && B.ai === 80 && G.ai === null && D.ai === null);

    // امتیازها (هر معیار نسبت به بهترین)
    const expA = { jury: 500, people: (300 * 50) / 160, ai: (200 * 60) / 80 };
    const expG = { jury: (500 * 70) / 80, people: (300 * 100) / 160, ai: 0 };
    check("بتا در هر سه معیار بهترین است → ۱۰۰۰", near(B.pts.jury, 500) && near(B.pts.people, 300) && near(B.pts.ai, 200) && near(B.total, 1000), JSON.stringify(B.pts));
    check(
      "امتیاز آلفا = نسبت‌ها منهای کسر تقلب ۲۰",
      near(A.pts.jury, expA.jury) && near(A.pts.people, expA.people) && near(A.pts.ai, expA.ai) && A.cheatPenalty === 20 &&
        near(A.total, expA.jury + expA.people + expA.ai - 20),
      `total=${A.total.toFixed(3)}`
    );
    check("امتیاز گاما", near(G.total, expG.jury + expG.people + expG.ai), `total=${G.total.toFixed(3)}`);
    check("امتیاز دلتا = فقط حمایت مردمی ۱۸٫۷۵", near(D.total, (300 * 10) / 160), `total=${D.total}`);
    check(
      "رتبه‌ها: بتا ۱، آلفا ۲، گاما ۳، دلتا ۴",
      B.rank === 1 && A.rank === 2 && G.rank === 3 && D.rank === 4,
      output.teams.map((t) => `${t.rank}:${t.total.toFixed(1)}`).join(" ")
    );

    // ---------- جوایز (هر پروژه حداکثر یک جایزه) ----------
    const teamNames = new Map((await prisma.team.findMany({ select: { id: true, name: true } })).map((t) => [t.id, t.name]));
    const awards = computeAwards(output, { teamNames, picks: { ai: delta.id, live: beta.id } });
    const awardOf = (key: string) => awards.find((a) => a.key === key);
    check("جایزهٔ قهرمان → بتا", awardOf("champion")?.teamId === beta.id, String(awardOf("champion")?.teamName));
    check("انتخاب داوران → آلفا (هم‌نمره با بتا؛ بتا قبلاً جایزه گرفته)", awardOf("jury")?.teamId === alpha.id, String(awardOf("jury")?.teamName));
    check("انتخاب مردم → گاما (بتا قبلاً جایزه گرفته)", awardOf("people")?.teamId === gamma.id, String(awardOf("people")?.teamName));
    check("هوش مصنوعی (انتخاب داوران) → دلتا", awardOf("ai")?.teamId === delta.id, String(awardOf("ai")?.teamName));
    check("محصول لایو: انتخاب بتا که قبلاً جایزه گرفته اهدا نمی‌شود", !awardOf("live"), JSON.stringify(awardOf("live")));
    check("هیچ تیمی دو جایزه نگرفت", new Set(awards.map((a) => a.teamId)).size === awards.length, `${awards.length} جایزه`);
    check("مجموع درصد جوایز اهداشده ≤ ۱۰۰", awards.reduce((a, w) => a + w.sharePct, 0) <= 100);

    // ---------- معیار عمومی پیش از پایان بازی: تعداد حامی ----------
    invalidate("scores:");
    const hall = await getHallPayloadCached();
    check("سالن پیش از پایان: معیار = تعداد حامی", hall.metricLabel === "تعداد حامی", hall.metricLabel);
    check(
      "ترتیب عمومی: بتا (۴)، گاما (۲)، آلفا و دلتا (۱؛ تساوی با سکهٔ دریافتی شکسته می‌شود)",
      hall.topTeams.map((t) => t.teamId).join(",") === [beta.id, gamma.id, alpha.id, delta.id].join(","),
      hall.topTeams.map((t) => `${t.name}=${t.metric}`).join(" ")
    );

    // ---------- تنظیمات برگزارکننده روی امتیاز اثر می‌گذارند ----------
    await prisma.setting.create({ data: { key: "support_cap", value: "1000" } });
    await prisma.setting.create({ data: { key: "solo_boost_pct", value: "20" } });
    const output2 = await computeScores();
    const A2 = output2.teams.find((t) => t.teamId === alpha.id)!;
    const G2 = output2.teams.find((t) => t.teamId === gamma.id)!;
    check("support_cap=۱۰۰۰: حمایت مردمی آلفا = ۱۰۰", near(A2.people, 100), `=${A2.people}`);
    check("کلید قدیمی solo_boost_pct بی‌اثر است: داوری گاما همان ۷۰", G2.juryAdjusted === 70, `=${G2.juryAdjusted}`);
    await prisma.setting.deleteMany({ where: { key: { in: ["support_cap", "solo_boost_pct"] } } });

    // ---------- تشخیص تبانی (خرید متقابل آلفا ↔ بتا) ----------
    await buy(pBeta.id, a2.id, 40);
    await buy(pAlpha.id, b0.id, 40);
    const flags = await detectAndFlagCollusion();
    const pair = flags.find(
      (f) => (f.teamId === alpha.id && f.otherTeamId === beta.id) || (f.teamId === beta.id && f.otherTeamId === alpha.id)
    );
    check("پرچم تبانی برای زوج آلفا↔بتا ثبت شد", !!pair, `تعداد پرچم=${flags.length}`);
    check("مبالغ پرچم ۴۰ و ۴۰ است (حمایت خودی و خرید از تیم خود حساب نمی‌شود)", !!pair && pair.amountAB === 40 && pair.amountBA === 40, pair ? `AB=${pair.amountAB} BA=${pair.amountBA}` : "-");
    check("زوج بی‌ارتباط پرچم نخورد", flags.length === 1, `تعداد=${flags.length}`);
    const flags2 = await detectAndFlagCollusion();
    check("اجرای دوبارهٔ تشخیص، پرچم تکراری نساخت", flags2.length === flags.length, `${flags.length} → ${flags2.length}`);
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
