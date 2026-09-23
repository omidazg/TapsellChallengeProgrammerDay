/**
 * دود-تست نشان‌ها، نظرسنجی و داشبورد تحلیلی (Item 46 و 50).
 * اجرا: npx tsx scripts/smoke-engagement.ts
 *
 * روی یک پایگاه‌دادهٔ SQLite موقت و تازه (migrate، بدون seed) فعالیت‌های مشخصی
 * می‌سازد و بررسی می‌کند که:
 *   - نشان‌ها دقیقاً به کاربر/کاربران درست تعلق می‌گیرند،
 *   - ثبت دوبارهٔ نظرسنجی رکورد جدید نمی‌سازد (upsert)،
 *   - اعداد داشبورد تحلیلی با دادهٔ ساخته‌شده همخوان است.
 * در پایان پایگاه‌دادهٔ موقت به‌طور کامل حذف می‌شود.
 */
import { createTempDb, isTempDatabaseUrl } from "./lib/temp-db";

const ownTempDb = isTempDatabaseUrl(process.env.DATABASE_URL) ? null : createTempDb("engagement");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { invalidate } = await import("../src/lib/ttl-cache");
  const { computeAllBadges, BADGES } = await import("../src/lib/badges");
  const { getAnalytics } = await import("../src/lib/analytics");

  const TAG = "smokeengage-" + Date.now();
  const mail = (n: string) => `${TAG}-${n}@tapsell.ir`;
  // شروع خیلی قبل از «حالا» تا با هر کاربر واقعی دیگری که ممکن است در پایگاه‌داده
  // باشد تداخل نکند و ترتیب ثبت‌نام (برای نشان «سحرخیز») کاملاً قطعی بماند.
  const T0 = new Date("2000-01-01T00:00:00Z").getTime();
  const MIN = 60_000;
  const HOUR = 3_600_000;

  async function makeUser(n: string, offsetMin: number) {
    return prisma.user.create({
      data: {
        email: mail(n),
        passwordHash: "x",
        nickname: `کاربر ${n}`,
        role: "DEALMAKER",
        power: "HYPE",
        coffee: 5,
        bugs: 50,
        sleep: 7,
        confidence: 100,
        avatarSeed: `seed-${n}`,
        createdAt: new Date(T0 + offsetMin * MIN),
      },
    });
  }

  async function makeTeam(n: string, memberIds: string[]) {
    const team = await prisma.team.create({ data: { name: `تیم ${TAG} ${n}`, slug: `${TAG}-${n}` } });
    await prisma.user.updateMany({ where: { id: { in: memberIds } }, data: { teamId: team.id } });
    return team;
  }

  async function makeIdea(teamId: string, n: string) {
    return prisma.idea.create({
      data: {
        teamId,
        title: `ایدهٔ ${n}`,
        oneLiner: "یک جمله",
        problem: "مسئله‌ای که حل می‌کند",
        audience: "مخاطب هدف",
        buildPlan: "برنامهٔ ساخت",
        fundingCap: 500,
        revenueShare: 30,
      },
    });
  }

  async function makeProduct(teamId: string, n: string) {
    return prisma.product.create({ data: { teamId, name: `محصول ${n}` } });
  }

  const userIds: string[] = [];
  const teamIds: string[] = [];
  const ideaIds: string[] = [];
  const productIds: string[] = [];
  const investmentIds: string[] = [];
  const purchaseIds: string[] = [];
  const heartIds: string[] = [];
  const auctionIds: string[] = [];

  try {
    console.log("\n# ۱ — ساخت کاربران و تیم‌ها");
    // آفست ثبت‌نام: a1..a3=0..2, b1..b3=3..5, c1..c3=6..8, investor1=9 (این ۱۰ نفر
    // اول باید «سحرخیز» شوند)، سپس buyer1=10, hearter1=11 (این‌ها نباید سحرخیز باشند)
    const [a1, a2, a3] = await Promise.all([makeUser("a1", 0), makeUser("a2", 1), makeUser("a3", 2)]);
    const [b1, b2, b3] = await Promise.all([makeUser("b1", 3), makeUser("b2", 4), makeUser("b3", 5)]);
    const [c1, c2, c3] = await Promise.all([makeUser("c1", 6), makeUser("c2", 7), makeUser("c3", 8)]);
    const investor1 = await makeUser("investor1", 9);
    const buyer1 = await makeUser("buyer1", 10);
    const hearter1 = await makeUser("hearter1", 11);
    const allUsers = [a1, a2, a3, b1, b2, b3, c1, c2, c3, investor1, buyer1, hearter1];
    userIds.push(...allUsers.map((u) => u.id));
    check("۱۲ کاربر ساخته شد", userIds.length === 12);

    const teamA = await makeTeam("A", [a1.id, a2.id, a3.id]);
    const teamB = await makeTeam("B", [b1.id, b2.id, b3.id]);
    const teamC = await makeTeam("C", [c1.id, c2.id, c3.id]);
    teamIds.push(teamA.id, teamB.id, teamC.id);

    const ideaA = await makeIdea(teamA.id, "A");
    const ideaB = await makeIdea(teamB.id, "B");
    const ideaC = await makeIdea(teamC.id, "C");
    ideaIds.push(ideaA.id, ideaB.id, ideaC.id);

    const productA = await makeProduct(teamA.id, "A");
    const productB = await makeProduct(teamB.id, "B");
    const productC = await makeProduct(teamC.id, "C");
    productIds.push(productA.id, productB.id, productC.id);

    console.log("\n# ۲ — فعالیت (سرمایه‌گذاری، خرید، قلب، حراج)");
    // investor1: اولین سرمایه‌گذاری کل بازی + سرمایه‌گذاری روی ۳ تیم متفاوت
    const inv1 = await prisma.investment.create({ data: { ideaId: ideaA.id, userId: investor1.id, amount: 10, createdAt: new Date(T0 + 20 * HOUR) } });
    const inv2 = await prisma.investment.create({ data: { ideaId: ideaB.id, userId: investor1.id, amount: 10, createdAt: new Date(T0 + 21 * HOUR) } });
    const inv3 = await prisma.investment.create({ data: { ideaId: ideaC.id, userId: investor1.id, amount: 10, createdAt: new Date(T0 + 22 * HOUR) } });
    // a1: یک سرمایه‌گذاری، بعد از investor1 (نباید «اولین سرمایه‌گذار» را ببرد) و فقط روی یک تیم
    const inv4 = await prisma.investment.create({ data: { ideaId: ideaB.id, userId: a1.id, amount: 5, createdAt: new Date(T0 + 23 * HOUR) } });
    investmentIds.push(inv1.id, inv2.id, inv3.id, inv4.id);

    // buyer1: سه خرید از سه محصول متفاوت (بیشترین خرید)
    const p1 = await prisma.purchase.create({ data: { productId: productA.id, userId: buyer1.id, amount: 30, createdAt: new Date(T0 + 24 * HOUR) } });
    const p2 = await prisma.purchase.create({ data: { productId: productB.id, userId: buyer1.id, amount: 20, createdAt: new Date(T0 + 25 * HOUR) } });
    const p3 = await prisma.purchase.create({ data: { productId: productC.id, userId: buyer1.id, amount: 10, createdAt: new Date(T0 + 26 * HOUR) } });
    // a2: یک خرید بزرگ از محصول A تا فروش تیم A از همه بیشتر شود (۳۰+۲۵=۵۵ در برابر ۲۰ و ۱۰)
    const p4 = await prisma.purchase.create({ data: { productId: productA.id, userId: a2.id, amount: 25, createdAt: new Date(T0 + 27 * HOUR) } });
    purchaseIds.push(p1.id, p2.id, p3.id, p4.id);

    // hearter1: سه قلب به سه محصول متفاوت (بیشترین قلب)
    const h1 = await prisma.heart.create({ data: { productId: productA.id, userId: hearter1.id, createdAt: new Date(T0 + 28 * HOUR) } });
    const h2 = await prisma.heart.create({ data: { productId: productB.id, userId: hearter1.id, createdAt: new Date(T0 + 28 * HOUR + 10 * MIN) } });
    const h3 = await prisma.heart.create({ data: { productId: productC.id, userId: hearter1.id, createdAt: new Date(T0 + 28 * HOUR + 20 * MIN) } });
    const h4 = await prisma.heart.create({ data: { productId: productA.id, userId: a1.id, createdAt: new Date(T0 + 28 * HOUR + 30 * MIN) } });
    heartIds.push(h1.id, h2.id, h3.id, h4.id);

    // حراج پایان‌یافته با برندهٔ b2
    const auction = await prisma.auction.create({
      data: { productId: productB.id, status: "ENDED", winnerId: b2.id, finalPrice: 40, order: 1 },
    });
    auctionIds.push(auction.id);

    console.log("\n# ۳ — نشان‌ها");
    invalidate(""); // کش نشان‌ها/تحلیل را پاک کن تا فعالیت تازه دیده شود
    const badges = await computeAllBadges();

    check("همهٔ نشان‌های تعریف‌شده در نقشهٔ محاسبه حاضرند", BADGES.every((b) => badges.has(b.id)), JSON.stringify(BADGES.map((b) => b.id)));

    check("اولین سرمایه‌گذار: investor1", [...(badges.get("first_investor") ?? [])].join(",") === investor1.id);

    const teamAngels = badges.get("team_angel") ?? new Set();
    check("فرشتهٔ تیم‌ها فقط investor1 است (۳ تیم متفاوت)", teamAngels.size === 1 && teamAngels.has(investor1.id), JSON.stringify([...teamAngels]));

    const proBuyers = badges.get("pro_buyer") ?? new Set();
    check("خریدار حرفه‌ای فقط buyer1 است (۳ خرید)", proBuyers.size === 1 && proBuyers.has(buyer1.id), JSON.stringify([...proBuyers]));

    const winners = badges.get("auction_winner") ?? new Set();
    check("برندهٔ حراج شامل b2 است", winners.has(b2.id) && !winners.has(b1.id), JSON.stringify([...winners]));

    const earlyBirds = badges.get("early_bird") ?? new Set();
    const expectedEarly = [a1, a2, a3, b1, b2, b3, c1, c2, c3, investor1].map((u) => u.id);
    check(
      "سحرخیز دقیقاً ده نفر اول ثبت‌نامی است",
      expectedEarly.every((id) => earlyBirds.has(id)) && !earlyBirds.has(buyer1.id) && !earlyBirds.has(hearter1.id),
      JSON.stringify([...earlyBirds])
    );

    const heartHunters = badges.get("heart_hunter") ?? new Set();
    check("شکارچی قلب فقط hearter1 است (۳ قلب)", heartHunters.size === 1 && heartHunters.has(hearter1.id), JSON.stringify([...heartHunters]));

    const topSales = badges.get("top_sales") ?? new Set();
    check(
      "فروش برتر همهٔ اعضای تیم A است",
      topSales.size === 3 && [a1, a2, a3].every((u) => topSales.has(u.id)),
      JSON.stringify([...topSales])
    );

    console.log("\n# ۴ — نظرسنجی: upsert به‌جای رکورد تکراری");
    await prisma.surveyResponse.upsert({
      where: { userId: investor1.id },
      update: { rating: 5, fun: 4, learned: 3, comment: "اول" },
      create: { userId: investor1.id, rating: 5, fun: 4, learned: 3, comment: "اول" },
    });
    const afterFirst = await prisma.surveyResponse.count({ where: { userId: investor1.id } });
    check("پس از ثبت اول، دقیقاً یک پاسخ وجود دارد", afterFirst === 1, String(afterFirst));

    await prisma.surveyResponse.upsert({
      where: { userId: investor1.id },
      update: { rating: 2, fun: 2, learned: 2, comment: "تغییر کرد" },
      create: { userId: investor1.id, rating: 2, fun: 2, learned: 2, comment: "تغییر کرد" },
    });
    const afterSecond = await prisma.surveyResponse.count({ where: { userId: investor1.id } });
    const updated = await prisma.surveyResponse.findUniqueOrThrow({ where: { userId: investor1.id } });
    check("پس از ثبت دوم، همچنان دقیقاً یک پاسخ وجود دارد (نه دو تا)", afterSecond === 1, String(afterSecond));
    check("مقدار پاسخ به‌روز شده، نه اضافه‌شده", updated.rating === 2 && updated.comment === "تغییر کرد", JSON.stringify(updated));

    console.log("\n# ۵ — داشبورد تحلیلی");
    invalidate("");
    const analytics = await getAnalytics();

    check("تعداد ثبت‌نامی‌ها برابر کاربران ساخته‌شده است", analytics.participation.registered === userIds.length, String(analytics.participation.registered));
    check("تعداد عضو تیم برابر ۹ است", analytics.participation.inTeam.count === 9, String(analytics.participation.inTeam.count));
    check("تعداد سرمایه‌گذاران برابر ۲ است (investor1, a1)", analytics.participation.investors.count === 2, String(analytics.participation.investors.count));
    check("تعداد خریداران برابر ۲ است (buyer1, a2)", analytics.participation.buyers.count === 2, String(analytics.participation.buyers.count));
    check("تعداد قلب‌دهندگان برابر ۲ است (hearter1, a1)", analytics.participation.hearters.count === 2, String(analytics.participation.hearters.count));
    check("بدون پیشنهاد حراج در این آزمون: صفر", analytics.participation.bidders.count === 0, String(analytics.participation.bidders.count));

    const hourlySum = analytics.hourly.reduce((s, b) => s + b.count, 0);
    check("مجموع هیستوگرام ساعتی برابر تعداد کل رخدادهاست (۴+۴+۴)", hourlySum === 12, String(hourlySum));

    check("نظرسنجی: یک پاسخ ثبت‌شده", analytics.survey.count === 1, String(analytics.survey.count));
    check("نظرسنجی: میانگین رضایت کلی برابر آخرین مقدار (۲) است", analytics.survey.averages.rating === 2, String(analytics.survey.averages.rating));
    check("نظرسنجی: توزیع رضایت کلی روی بازهٔ ۲ یک واحد دارد", analytics.survey.distributions.rating[1] === 1, JSON.stringify(analytics.survey.distributions.rating));
    check(
      "نظرسنجی: آخرین نظر متن به‌روزشده را نشان می‌دهد",
      analytics.survey.latestComments[0]?.comment === "تغییر کرد",
      JSON.stringify(analytics.survey.latestComments)
    );

    check(
      "نرخ خرج سکه صفر است (هیچ کیفی در این آزمون دست‌نخورده)",
      analytics.spend.seed.spentPct === 0 && analytics.spend.buy.spentPct === 0,
      JSON.stringify(analytics.spend)
    );
  } finally {
    console.log("\n# پاک‌سازی");
    await prisma.heart.deleteMany({ where: { id: { in: heartIds } } });
    await prisma.purchase.deleteMany({ where: { id: { in: purchaseIds } } });
    await prisma.investment.deleteMany({ where: { id: { in: investmentIds } } });
    await prisma.auction.deleteMany({ where: { id: { in: auctionIds } } });
    await prisma.surveyResponse.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.idea.deleteMany({ where: { id: { in: ideaIds } } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { teamId: null } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.team.deleteMany({ where: { id: { in: teamIds } } });

    console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
    await prisma.$disconnect();
    ownTempDb?.cleanup();
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
