/**
 * دود-تست امتیازدهی هر محور (داوری انسانی + بازار + داوری هوش مصنوعی با وزن همان محور).
 * اجرا: npx tsx scripts/smoke-scoring.ts
 *
 * روی یک پایگاه‌دادهٔ SQLite موقت (createTempDb) چهار تیم می‌سازد:
 *   آلفا (۳ نفر، کسر تقلب ۲۰)، بتا (۲ نفر)، گاما (شرکت فردی، ۱ نفر) و دلتا (۲ نفر، فقط ایده)
 * و چند حامی بی‌تیم که از ایده‌ها حمایت می‌کنند و محصولات را می‌خرند. سپس خروجی
 * computeScores / awardsFor / معیار عمومی سالن (امتیاز زنده) و detectAndFlagCollusion را
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
  const { computeScores, awardsFor } = await import("../src/lib/scoring");
  const { peopleSupport, juryRawScore, scoreGame, defaultConfig } = await import("../src/lib/economy/engine");
  const { detectAndFlagCollusion } = await import("../src/lib/admin");
  const { setPhase } = await import("../src/lib/phase");
  const { setModuleStatus } = await import("../src/lib/module-state");
  const { parseCriteria, parseWeights } = await import("../src/lib/tracks");
  const { invalidate } = await import("../src/lib/ttl-cache");
  const { getHallPayloadCached } = await import("../src/lib/hall");
  const { DEFAULTS } = await import("../src/lib/constants");

  try {
    // ---------- موتور خالص ----------
    {
      // ۱۰ نفر که هر کدام ۱۰ سکه بدهند، ۱۰ برابر یک نفر با ۱۰۰ سکه می‌ارزند.
      const many = peopleSupport(Array.from({ length: 10 }, (_, i) => ({ userId: `u${i}`, amount: 10 })), 1000);
      const one = peopleSupport([{ userId: "whale", amount: 100 }], 1000);
      check("فرمول درجه‌دو: ۱۰×۱۰ سکه = ۱۰ برابر ۱×۱۰۰ سکه (بدون سقف)", near(many.score, 10 * one.score), `${many.score}/${one.score}`);
      const capped = peopleSupport([{ userId: "whale", amount: 100 }], DEFAULTS.supportCap);
      check("سقف اثر هر نفر (support_cap=۵۰): ۱۰۰ سکهٔ یک نفر = ۵۰", near(capped.score, 50), `=${capped.score}`);
      const excluded = peopleSupport([{ userId: "m", amount: 30 }, { userId: "x", amount: 9 }], 50, new Set(["m"]));
      check("سکهٔ اعضای خود تیم حساب نمی‌شود", near(excluded.score, 9) && excluded.supporters === 1 && excluded.coins === 9, JSON.stringify(excluded));
      check("داوری: میانگین داوران × ۱۰", juryRawScore([{ a: 9, b: 7 }, { a: 6, b: 6 }], ["a", "b"]) === 70);
      check("داوری: معیار بی‌نمره کنار می‌رود", juryRawScore([{ a: 6 }], ["a", "b"]) === 60);
      check("داوری: بدون نمره → null", juryRawScore([], ["a"]) === null && juryRawScore([{}], ["a"]) === null);
      // تعداد اعضای تیم در امتیاز هیچ اثری ندارد.
      const same = {
        trackId: "general",
        category: "TECH",
        productName: "محصول",
        supports: [{ userId: "fan", amount: 20 }],
        juryRaw: 70,
        aiQuality: 70,
        stats: null,
        cheatPenalty: 0,
        productSubmittedAt: null,
      };
      const sized = scoreGame(defaultConfig(), [
        { teamId: "one", productId: "p1", memberIds: ["o1"], ...same },
        { teamId: "three", productId: "p3", memberIds: ["t1", "t2", "t3"], ...same },
      ]);
      const [soloT, trioT] = ["one", "three"].map((id) => sized.teams.find((t) => t.teamId === id)!);
      check(
        "اندازهٔ تیم بی‌اثر: تیم ۱ و ۳ نفره با ورودی یکسان امتیاز یکسان می‌گیرند",
        soloT.total === trioT.total && JSON.stringify(soloT.pts) === JSON.stringify(trioT.pts),
        `${soloT.total}/${trioT.total}`
      );
    }

    // ---------- چیدمان ----------
    let n = 0;
    const mkUser = async (key: string, teamId: string | null, staffRole = "") =>
      prisma.user.create({
        data: {
          email: `scoring-${key}-${n++}@example.test`,
          passwordHash: "x",
          nickname: `کاربر ${key}`,
          role: "BUILDER",
          power: "",
          teamId,
          staffRole,
          seedWallet: 0,
          buyWallet: 200,
        },
      });
    const mkIdea = async (teamId: string, title: string, trackId = "general") =>
      prisma.idea.create({
        data: {
          teamId,
          trackId,
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
    const judge1 = await mkUser("judge1", null, "JUDGE");
    const judge2 = await mkUser("judge2", null, "JUDGE");

    const ideaAlpha = await mkIdea(alpha.id, "ایدهٔ آلفا");
    const ideaBeta = await mkIdea(beta.id, "ایدهٔ بتا");
    const ideaGamma = await mkIdea(gamma.id, "ایدهٔ گاما");
    const ideaDelta = await mkIdea(delta.id, "ایدهٔ دلتا");
    const ideaBetaContent = await mkIdea(beta.id, "ایدهٔ محتوای بتا", "content");
    await mkIdea(alpha.id, "ایدهٔ محور مخفی", "os"); // محور مخفی در امتیاز نمی‌آید

    const tracksById = new Map((await prisma.track.findMany()).map((t) => [t.id, t]));
    const generalWeights = parseWeights(tracksById.get("general")!.weights);
    check("وزن‌های محور عمومی ۴۰/۳۰/۳۰ و جمع ۱۰۰", generalWeights.jury === 40 && generalWeights.market === 30 && generalWeights.ai === 30, JSON.stringify(generalWeights));
    const criteriaOf = (trackId: string) => parseCriteria(tracksById.get(trackId)!.juryCriteria).map((c) => c.key);
    const judgeScore = (productId: string, judgeId: string, value: number, trackId = "general") =>
      prisma.juryScore.create({
        data: { productId, judgeId, scores: JSON.stringify(Object.fromEntries(criteriaOf(trackId).map((k) => [k, value]))) },
      });
    const mkProduct = (team: { id: string; slug: string }, name: string, category: string, aiQuality: number | null, trackId = "general") =>
      prisma.product.create({
        data: { teamId: team.id, trackId, slug: `${team.slug}-${trackId}`, name, category, price: 10, submittedAt: new Date(), aiQuality },
      });
    const pAlpha = await mkProduct(alpha, "محصول آلفا", "TECH", 60);
    const pBeta = await mkProduct(beta, "محصول بتا", "TECH", 80);
    const pGamma = await mkProduct(gamma, "محصول گاما", "NON_TECH", null);
    const pBetaContent = await mkProduct(beta, "محتوای بتا", "NON_TECH", 50, "content");
    // دلتا محصولی ثبت نکرده: داوری null، هوش مصنوعی null

    // آلفا: دو داور ۱۰ و ۶ → میانگین ۸۰
    await judgeScore(pAlpha.id, judge1.id, 10);
    await judgeScore(pAlpha.id, judge2.id, 6);
    await judgeScore(pBeta.id, judge1.id, 8);
    await judgeScore(pGamma.id, judge1.id, 7);
    await judgeScore(pBetaContent.id, judge1.id, 8, "content");

    // آمار بازار: بتا بهترین محور. ستارهٔ آلفا کمتر از حداقل نظر دارد و آمار گاما پرچم تقلب خورده است.
    await prisma.bazaarStat.create({ data: { productId: pBeta.id, activeInstalls: 1000, revenueToman: 100000, rating: 4.5, commentCount: 100 } });
    await prisma.bazaarStat.create({ data: { productId: pAlpha.id, activeInstalls: 100, revenueToman: 0, rating: 5, commentCount: 5 } });
    await prisma.bazaarStat.create({ data: { productId: pGamma.id, activeInstalls: 99999, revenueToman: 99999999, rating: 5, commentCount: 9999, flagged: true, flagNote: "نصب مشکوک" } });

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
    // محور محتوا جدا حساب می‌شود
    await support(ideaBetaContent.id, s[3].id, 16);

    await setPhase("LIVE", null);

    // ---------- امتیازدهی ----------
    const output = await computeScores();
    const entry = (teamId: string, trackId = "general") => output.teams.find((t) => t.teamId === teamId && t.trackId === trackId)!;
    const A = entry(alpha.id);
    const B = entry(beta.id);
    const G = entry(gamma.id);
    const D = entry(delta.id);
    const BC = entry(beta.id, "content");
    check("چهار ثبت در محور عمومی + یک ثبت محتوا؛ محور مخفی حساب نشد", output.teams.length === 5 && !output.teams.some((t) => t.trackId === "os"), `تعداد=${output.teams.length}`);

    check("تعداد اعضا: ۳ / ۲ / ۱ / ۲", A.memberCount === 3 && B.memberCount === 2 && G.memberCount === 1 && D.memberCount === 2);
    check("داوری آلفا = میانگین دو داور = ۸۰", A.juryRaw === 80, String(A.juryRaw));
    check("داوری بتا = ۸۰", B.juryRaw === 80, String(B.juryRaw));
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

    // زیرشاخص‌های بازار (سقف پیش‌فرض ۶۰/۹۹/۷۲/۴۲/۲۷ روی ۳۰۰) نسبت به بهترین محور
    check(
      "بازار بتا: همهٔ زیرشاخص‌ها در سقف، ستاره به نسبت ۴٫۵ از ۵",
      near(B.marketDetail.support, 60) && near(B.marketDetail.activeInstalls, 99) && near(B.marketDetail.revenue, 72) && near(B.marketDetail.rating, 42 * 0.9) && near(B.marketDetail.comments, 27),
      JSON.stringify(B.marketDetail)
    );
    check(
      "بازار آلفا: مقیاس لگاریتمی نصب از نسبت خطی بیشتر است و کمتر از بهترین",
      A.marketDetail.activeInstalls > (99 * 100) / 1000 && A.marketDetail.activeInstalls < 99,
      String(A.marketDetail.activeInstalls)
    );
    check("بازار آلفا: ستاره با کمتر از ۱۰ نظر حساب نمی‌شود", A.marketDetail.rating === 0, String(A.marketDetail.rating));
    check(
      "بازار گاما: آمار پرچم‌خورده صفر و فقط حمایت می‌ماند؛ سقف بهترین را هم تغییر نمی‌دهد",
      G.marketDetail.activeInstalls === 0 && G.marketDetail.revenue === 0 && G.marketDetail.rating === 0 && G.marketDetail.comments === 0 && near(G.marketDetail.support, (60 * 100) / 160),
      JSON.stringify(G.marketDetail)
    );

    // امتیاز کل (جمع وزن‌های ۱۰۰۰)
    check("بتا: داوری ۴۰۰ و هوش ۳۰۰", near(B.pts.jury, 400) && near(B.pts.ai, 300), JSON.stringify(B.pts));
    check(
      "امتیاز آلفا = نسبت‌ها منهای کسر تقلب ۲۰",
      near(A.pts.jury, 400) && near(A.pts.ai, (300 * 60) / 80) && A.cheatPenalty === 20 && near(A.total, A.pts.jury + A.pts.market + A.pts.ai - 20),
      `total=${A.total.toFixed(3)}`
    );
    check("امتیاز گاما", near(G.pts.jury, (400 * 70) / 80) && G.pts.ai === 0 && near(G.total, G.pts.jury + G.pts.market), `total=${G.total.toFixed(3)}`);
    check("امتیاز دلتا = فقط حمایت", near(D.total, (60 * 10) / 160), `total=${D.total}`);
    check(
      "رتبه‌های محور عمومی: بتا ۱، آلفا ۲، گاما ۳، دلتا ۴",
      B.rank === 1 && A.rank === 2 && G.rank === 3 && D.rank === 4,
      output.teams.map((t) => `${t.trackId}:${t.rank}:${t.total.toFixed(1)}`).join(" ")
    );

    // محور محتوا با وزن و رتبهٔ خودش
    check("محور محتوا: داوری ۵۲۰، هوش ۴۲۰، بازار فقط حمایت ۶۰", near(BC.pts.jury, 520) && near(BC.pts.ai, 420) && near(BC.pts.market, 60), JSON.stringify(BC.pts));
    check("محور محتوا: رتبهٔ ۱ مستقل از محور عمومی", BC.rank === 1 && near(BC.people, 16), `${BC.rank}/${BC.people}`);

    // ---------- جوایز ----------
    const specialA = await prisma.prize.create({ data: { trackId: "general", kind: "SPECIAL", label: "جایزهٔ ویژهٔ الف", winnerProductId: pAlpha.id, order: 90 } });
    const specialB = await prisma.prize.create({ data: { trackId: "general", kind: "SPECIAL", label: "جایزهٔ ویژهٔ ب", winnerProductId: pAlpha.id, order: 91 } });
    const specialNone = await prisma.prize.create({ data: { trackId: "general", kind: "SPECIAL", label: "جایزهٔ ویژهٔ بی‌برنده", order: 92 } });
    const awards = await awardsFor(output);
    const awardOf = (id: string) => awards.find((a) => a.prizeId === id);
    check("نفر اول فنی محور عمومی → بتا", awardOf("prize-general-tech")?.teamId === beta.id, String(awardOf("prize-general-tech")?.teamName));
    check("نفر اول غیرفنی محور عمومی → گاما", awardOf("prize-general-nontech")?.teamId === gamma.id, String(awardOf("prize-general-nontech")?.teamName));
    check("نفر اول محور محتوا → بتا", awardOf("prize-content")?.teamId === beta.id, String(awardOf("prize-content")?.teamName));
    check("محور مخفی جایزه ندارد", !awardOf("prize-os"));
    check("جایزهٔ ویژه به ثبت انتخاب‌شده رسید", awardOf(specialA.id)?.teamId === alpha.id, JSON.stringify(awardOf(specialA.id)));
    check("ثبتی که جایزهٔ ویژه برده دومی نمی‌گیرد", !awardOf(specialB.id));
    check("جایزهٔ ویژهٔ بی‌برنده اهدا نمی‌شود", !awardOf(specialNone.id));
    const rankByEntry = new Map<string, number>();
    for (const a of awards.filter((x) => x.kind === "RANK")) {
      const key = `${a.teamId}:${a.trackId}`;
      rankByEntry.set(key, (rankByEntry.get(key) ?? 0) + 1);
    }
    check("هیچ ثبتی دو جایزهٔ رتبه نگرفت", [...rankByEntry.values()].every((v) => v === 1), JSON.stringify([...rankByEntry]));

    // کمینهٔ ثبت و داوری: محور خلوت محتوا با داوری زیر ۵۰ جایزه ندارد
    await prisma.juryScore.updateMany({ where: { productId: pBetaContent.id }, data: { scores: JSON.stringify(Object.fromEntries(criteriaOf("content").map((k) => [k, 4]))) } });
    const thinAwards = await awardsFor(await computeScores());
    check("محور خلوت با داوری زیر حداقل: جایزه اهدا نمی‌شود", !thinAwards.some((a) => a.prizeId === "prize-content"));
    await prisma.juryScore.updateMany({ where: { productId: pBetaContent.id }, data: { scores: JSON.stringify(Object.fromEntries(criteriaOf("content").map((k) => [k, 8]))) } });
    await prisma.prize.deleteMany({ where: { id: { in: [specialA.id, specialB.id, specialNone.id] } } });

    // ---------- سالن عمومی: پیش از اعلام نتایج نمرهٔ داوری نشان داده نمی‌شود ----------
    invalidate("");
    const hall = await getHallPayloadCached();
    check("سالن پیش از اعلام: معیار = امتیاز زنده", hall.metricLabel === "امتیاز زنده", hall.metricLabel);
    const hallBeta = hall.topTeams.find((t) => t.teamId === beta.id && t.trackName && t.key.endsWith(":general"));
    check("سالن پیش از اعلام: امتیاز بدون داوری", !!hallBeta && near(hallBeta.metric, B.pts.market + B.pts.ai), JSON.stringify(hallBeta));
    await setModuleStatus("leaderboard", "hidden");
    invalidate("");
    const hallHidden = await getHallPayloadCached();
    check("جدول مخفی: سالن هیچ تیمی نشان نمی‌دهد", hallHidden.topTeams.length === 0, `len=${hallHidden.topTeams.length}`);
    await setModuleStatus("leaderboard", "ro");
    invalidate("");

    // ---------- تنظیمات برگزارکننده روی امتیاز اثر می‌گذارند ----------
    await prisma.setting.create({ data: { key: "support_cap", value: "1000" } });
    await prisma.setting.create({ data: { key: "rating_min_comments", value: "1" } });
    const output2 = await computeScores();
    const A2 = output2.teams.find((t) => t.teamId === alpha.id && t.trackId === "general")!;
    check("support_cap=۱۰۰۰: حمایت مردمی آلفا = ۱۰۰", near(A2.people, 100), `=${A2.people}`);
    check("rating_min_comments=۱: ستارهٔ آلفا حساب می‌شود", near(A2.marketDetail.rating, 42), `=${A2.marketDetail.rating}`);
    await prisma.setting.deleteMany({ where: { key: { in: ["support_cap", "rating_min_comments"] } } });

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
