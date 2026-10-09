/**
 * تست دودی منطق حمایت از ایده‌ها با سکه («دور حمایت»).
 * اجرا: npx tsx scripts/smoke-invest.ts
 *
 * دو تیم با ایدهٔ ثبت‌نهایی‌شده + یک کاربر بی‌تیم می‌سازد، فاز را روی SEED_ROUND می‌گذارد و
 * هستهٔ حمایت (`investCore`) را می‌آزماید: کسر از کیف سکه، ثبت دفتر کل، نبود سقف، رد حمایت
 * از تیم خود، سکهٔ ناکافی، رزرو حراج و قفل فاز.
 * روی پایگاه‌دادهٔ موقت اجرا می‌شود (createTempDb)؛ dev.db لمس نمی‌شود.
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
  const { investCore, investedByUserOnIdea, totalInvestedByUser } = await import("../src/lib/invest");
  const { DEFAULTS } = await import("../src/lib/constants");

  async function setPhaseValue(value: string) {
    await prisma.setting.upsert({
      where: { key: "phase" },
      update: { value },
      create: { key: "phase", value },
    });
  }
  const walletOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).buyWallet;

  try {
    // ---------- ساخت داده ----------
    const START = DEFAULTS.startingCoins;
    const teams: string[] = [];
    const members: string[] = [];
    const ideas: string[] = [];
    for (const n of [1, 2]) {
      const team = await prisma.team.create({ data: { name: `${TAG}_team_${n}`, slug: `${TAG}-team-${n}` } });
      teams.push(team.id);
      const user = await prisma.user.create({
        data: {
          email: `${TAG}_u${n}@example.test`,
          passwordHash: "x",
          nickname: `کاربر ${n}`,
          role: "DEALMAKER",
          power: "",
          teamId: team.id,
          seedWallet: 0,
          buyWallet: START,
        },
      });
      members.push(user.id);
      const idea = await prisma.idea.create({
        data: {
          teamId: team.id,
          title: `ایدهٔ ${n}`,
          oneLiner: "یک جملهٔ کوتاه",
          problem: "مسئله",
          audience: "مخاطب",
          buildPlan: "برنامه",
          fundingCap: 0,
          revenueShare: 0,
          submittedAt: new Date(),
        },
      });
      ideas.push(idea.id);
    }
    const [u1, u2] = members;
    const [idea1, idea2] = ideas;
    const teamless = await prisma.user.create({
      data: {
        email: `${TAG}_free@example.test`,
        passwordHash: "x",
        nickname: "حامی بی‌تیم",
        role: "BUILDER",
        power: "",
        seedWallet: 0,
        buyWallet: START,
      },
    });
    // ایدهٔ ثبت‌نشده
    const draftTeam = await prisma.team.create({ data: { name: `${TAG}_draft`, slug: `${TAG}-draft` } });
    const draftIdea = await prisma.idea.create({
      data: { teamId: draftTeam.id, title: "پیش‌نویس", oneLiner: "-", problem: "-", audience: "-", buildPlan: "-", fundingCap: 0, revenueShare: 0 },
    });

    await setPhaseValue("SEED_ROUND");

    // ---------- ۱) حمایت معتبر ----------
    const r1 = await investCore(prisma, u1, idea2, 30);
    check("حمایت معتبر از ایدهٔ تیم دیگر پذیرفته شد", r1.ok, r1.ok ? "" : r1.error);
    if (r1.ok) check("حمایت بیرونی selfFunded=false است", r1.selfFunded === false);
    check(`کیف سکه از ${START} به ${START - 30} کاهش یافت`, (await walletOf(u1)) === START - 30, `=${await walletOf(u1)}`);
    const u1User = await prisma.user.findUniqueOrThrow({ where: { id: u1 } });
    check("seedWallet دست‌نخورده (صفر) می‌ماند", u1User.seedWallet === 0, `=${u1User.seedWallet}`);
    const ledger = r1.ok ? await prisma.ledgerEntry.findFirst({ where: { refId: r1.investmentId } }) : null;
    check(
      "LedgerEntry حمایت: BUY / −۳۰ / INVEST / تیم ایده",
      !!ledger && ledger.wallet === "BUY" && ledger.delta === -30 && ledger.reason === "INVEST" && ledger.teamId === teams[1] && ledger.userId === u1,
      JSON.stringify(ledger)
    );

    // ---------- ۲) سقفی روی مبلغ نیست ----------
    const r2 = await investCore(prisma, u1, idea2, 150);
    check("حمایت بزرگ (۱۵۰ سکه، بیش از ۵۰) پذیرفته شد — سقفی نیست", r2.ok, r2.ok ? "" : r2.error);
    check("جمع حمایت u1 از ایدهٔ ۲ = ۱۸۰", (await investedByUserOnIdea(u1, idea2)) === 180);
    check("totalInvestedByUser = ۱۸۰", (await totalInvestedByUser(u1)) === 180);
    check("کیف u1 = ۲۰", (await walletOf(u1)) === START - 180, `=${await walletOf(u1)}`);

    // ---------- ۳) سکهٔ ناکافی ----------
    const r3 = await investCore(prisma, u1, idea2, 21);
    check("حمایت بیش از موجودی رد شد", !r3.ok && r3.error.includes("سکهٔ کافی"), r3.ok ? "پذیرفته شد" : r3.error);
    check("کیف پس از تلاش ناموفق تغییر نکرد", (await walletOf(u1)) === START - 180);
    const r3b = await investCore(prisma, u1, idea2, 20);
    check("حمایت با تمام موجودی باقی‌مانده پذیرفته شد", r3b.ok, r3b.ok ? "" : r3b.error);
    check("کیف صفر شد و منفی نشد", (await walletOf(u1)) === 0);

    // ---------- ۴) حمایت از ایدهٔ تیم خود ----------
    const r4 = await investCore(prisma, u2, idea2, 10);
    check("حمایت از ایدهٔ تیم خود رد شد", !r4.ok && r4.error.includes("تیم خودت"), r4.ok ? "پذیرفته شد" : r4.error);
    check("کیف u2 پس از رد شدن تغییر نکرد", (await walletOf(u2)) === START);

    // ---------- ۵) کاربر بی‌تیم می‌تواند حمایت کند ----------
    const r5 = await investCore(prisma, teamless.id, idea1, 10);
    check("کاربر بی‌تیم می‌تواند حمایت کند", r5.ok, r5.ok ? "" : r5.error);
    const r5b = await investCore(prisma, teamless.id, idea2, 10);
    check("حمایت از چند ایده مجاز است", r5b.ok, r5b.ok ? "" : r5b.error);

    // ---------- ۶) مبلغ نامعتبر و ایدهٔ ثبت‌نشده ----------
    const r6 = await investCore(prisma, u2, idea1, 0);
    check("مبلغ صفر رد شد", !r6.ok && r6.error.includes("نامعتبر"), r6.ok ? "پذیرفته شد" : r6.error);
    const r6b = await investCore(prisma, u2, idea1, -5);
    check("مبلغ منفی رد شد", !r6b.ok, r6b.ok ? "پذیرفته شد" : r6b.error);
    const r6c = await investCore(prisma, u2, draftIdea.id, 5);
    check("حمایت از ایدهٔ ثبت‌نشده رد شد", !r6c.ok, r6c.ok ? "پذیرفته شد" : r6c.error);
    const r6d = await investCore(prisma, "no-such-user", idea1, 5);
    check("کاربر ناموجود رد شد", !r6d.ok, r6d.ok ? "پذیرفته شد" : r6d.error);

    // ---------- ۷) سکه‌های رزروشده در حراج زنده خرج‌پذیر نیستند ----------
    {
      const product = await prisma.product.create({ data: { teamId: teams[0], name: "محصول حراجی", price: 10, submittedAt: new Date() } });
      const auction = await prisma.auction.create({
        data: { productId: product.id, status: "LIVE", startPrice: 5, startsAt: new Date(), endsAt: new Date(Date.now() + 60_000) },
      });
      await prisma.bid.create({ data: { auctionId: auction.id, userId: u2, amount: START - 5 } });
      const r7 = await investCore(prisma, u2, idea1, 10);
      check("با رزرو حراج، حمایت بیش از سکهٔ آزاد رد شد", !r7.ok && r7.error.includes("سکهٔ کافی"), r7.ok ? "پذیرفته شد" : r7.error);
      const r7b = await investCore(prisma, u2, idea1, 5);
      check("حمایت در حد سکهٔ آزاد پذیرفته شد", r7b.ok, r7b.ok ? "" : r7b.error);
      await prisma.bid.deleteMany({ where: { auctionId: auction.id } });
      await prisma.auction.delete({ where: { id: auction.id } });
    }

    // ---------- ۸) قفل فاز ----------
    const walletBefore = await walletOf(u2);
    for (const phase of ["IDEATION", "BUILD", "MARKET", "CLOSED"]) {
      await setPhaseValue(phase);
      const r = await investCore(prisma, u2, idea1, 5);
      check(`خارج از «دور حمایت» (${phase}) رد شد`, !r.ok && r.error.includes("دور حمایت"), r.ok ? "پذیرفته شد" : r.error);
    }
    check("کیف پس از تلاش‌های خارج از فاز تغییر نکرد", (await walletOf(u2)) === walletBefore);
    await setPhaseValue("SEED_ROUND");

    // ---------- ۹) سازگاری دفتر کل با کیف ----------
    const sum = await prisma.ledgerEntry.aggregate({ where: { userId: u1, reason: "INVEST" }, _sum: { delta: true } });
    check("جمع دفتر کل حمایت‌های u1 = −۲۰۰", sum._sum.delta === -200, `=${sum._sum.delta}`);
    const count = await prisma.investment.count({ where: { userId: u1 } });
    check("سه ردیف حمایت برای u1 ثبت شد", count === 3, `=${count}`);
  } finally {
    await prisma.$disconnect();
    ownTempDb?.cleanup();
  }

  console.log("");
  console.log(`نتیجه: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("SMOKE: FAIL — خطای غیرمنتظره");
  console.error(e);
  ownTempDb?.cleanup();
  process.exit(1);
});
