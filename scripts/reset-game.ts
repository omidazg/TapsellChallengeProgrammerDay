/**
 * بازنشانی کامل بازی برای اجرای یک دور تازه (rehearsal یا event day دوباره).
 *
 * اجرا:
 *   npx tsx scripts/reset-game.ts --yes
 *   npx tsx scripts/reset-game.ts --yes --keep-teams
 *   npx tsx scripts/reset-game.ts --yes --wipe-announcements
 *   npx tsx scripts/reset-game.ts --yes --include-paid-orders   (اگر سفارش خرید سکهٔ پرداخت‌شده هست)
 *
 * چه‌کار می‌کند:
 *   - پاک می‌کند: ایده‌ها، حمایت‌ها (Investment)، پیام‌های due-diligence، محصولات،
 *     خریدها، لایک‌ها (Heart)، حراج‌ها، پیشنهادها (Bid)، جایگاه‌های تبلیغاتی
 *     (AdSlot/AdSlotBid)، دفتر کل (LedgerEntry)، سفارش‌های خرید سکه (CoinOrder)،
 *     امتیاز تیم‌ها (TeamScore)، پرچم‌های تبانی (CollusionFlag)، رأی‌های قدیمی
 *     سرپرست (TeamLeaderVote)، اعلان‌ها (Notification) و پاسخ‌های نظرسنجی پایان
 *     بازی (SurveyResponse).
 *   - تیم‌ها و دعوت‌نامه‌ها (TeamInvite) هم پاک می‌شوند مگر --keep-teams؛ با
 *     --keep-teams کسر امتیاز تقلب (cheatPenalty/cheatNote) و ستون‌های قدیمی تیم
 *     صفر می‌شوند.
 *   - کیف سکهٔ همه به starting_coins (پیش‌فرض DEFAULTS.startingCoins) برمی‌گردد
 *     (seedWallet قدیمی = ۰) و آمار کاربران (coffee/bugs/sleep/confidence) به مقدار
 *     پیش‌فرض schema.
 *   - کاربران، ادمین‌ها، تنظیمات بازی و Announcement‌ها دست‌نخورده می‌مانند
 *     (Announcement فقط با --wipe-announcements پاک می‌شود). فقط Setting‌های وضعیتِ
 *     دور قبل پاک می‌شوند: settled_at، last_auction_ended_at، انتخاب‌های داوران
 *     (award_ai_team_id/award_live_team_id) و پرچم‌های adslot_push_sent:*.
 *   - فاز بازی به REGISTRATION برمی‌گردد (phase_ends_at پاک می‌شود).
 *
 * ایمنی:
 *   - بدون --yes هیچ کاری انجام نمی‌شود (dry بودن پیش‌فرض).
 *   - اگر NODE_ENV=production باشد و ALLOW_RESET=1 ست نشده باشد، امتناع
 *     می‌کند (برای جلوگیری از پاک کردن تصادفی دادهٔ رویداد واقعی).
 *   - سفارش‌های PAID خرید سکه پول واقعی‌اند (و جزو صندوق جایزه): اگر وجود داشته
 *     باشند، بدون --include-paid-orders امتناع می‌کند. قبلش از جدول CoinOrder
 *     خروجی بگیرید.
 *   - همه چیز در یک تراکنش Prisma اجرا می‌شود؛ اگر جایی خطا بدهد، هیچ‌چیز
 *     تغییر نمی‌کند.
 */
import { createRequire } from "node:module";
import path from "node:path";

// `src/lib/db` (و ماژول‌های وابسته) ممکن است `server-only` را import کنند
// که بیرون از Next خطا می‌دهد؛ آن را قبل از import واقعی خنثی می‌کنیم.
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

const args = process.argv.slice(2);
const YES = args.includes("--yes");
const KEEP_TEAMS = args.includes("--keep-teams");
const WIPE_ANNOUNCEMENTS = args.includes("--wipe-announcements");
const INCLUDE_PAID_ORDERS = args.includes("--include-paid-orders");

/** Setting‌های وضعیتِ یک دور بازی (نه تنظیمات برگزارکننده) که باید با بازنشانی پاک شوند. */
const ROUND_STATE_KEYS = [
  "settled_at", // src/lib/settlement.ts (SETTLED_AT_KEY)
  "last_auction_ended_at", // src/lib/scheduler.ts
  "award_ai_team_id", // src/lib/scoring.ts (AWARD_PICK_KEYS.ai)
  "award_live_team_id", // src/lib/scoring.ts (AWARD_PICK_KEYS.live)
];
/** پیشوند پرچم‌های یک‌باره (adslot_push_sent: در src/lib/adslots.ts؛ shield_reminder: قدیمی) */
const ROUND_STATE_PREFIXES = ["adslot_push_sent:", "shield_reminder:"];

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_RESET !== "1") {
    console.error("!! NODE_ENV=production است. برای اجرا در تولید باید ALLOW_RESET=1 ست شود.");
    process.exit(1);
  }
  if (!YES) {
    console.error("!! این اسکریپت همهٔ دادهٔ بازی را پاک می‌کند. برای تأیید --yes را اضافه کنید.");
    console.error("   گزینه‌های اختیاری: --keep-teams  --wipe-announcements  --include-paid-orders");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/db");
  const { PHASES } = await import("../src/lib/phases");
  const { DEFAULTS } = await import("../src/lib/constants");
  const firstPhase = PHASES[0]; // REGISTRATION

  // سکهٔ اولیه از تنظیم starting_coins (همان که ثبت‌نام می‌خواند)
  const startingRow = await prisma.setting.findUnique({ where: { key: "starting_coins" } });
  const parsedStarting = parseInt(startingRow?.value ?? "", 10);
  const startingCoins = Number.isFinite(parsedStarting) && parsedStarting >= 0 ? parsedStarting : DEFAULTS.startingCoins;

  // سفارش‌های خرید سکه: PAID یعنی پول واقعی پرداخت شده است.
  const coinOrders = await prisma.coinOrder.count();
  const paidAgg = await prisma.coinOrder.aggregate({
    where: { status: "PAID" },
    _count: { _all: true },
    _sum: { coins: true, amountRial: true },
  });
  const paidOrders = paidAgg._count._all;
  console.log(`سفارش‌های خرید سکه: ${coinOrders} سفارش، که ${paidOrders} تای آن پرداخت‌شده (PAID) است.`);
  if (paidOrders > 0) {
    const paidCoins = paidAgg._sum.coins ?? 0;
    const paidToman = Math.round((paidAgg._sum.amountRial ?? 0) / 10);
    console.warn(
      `!! هشدار: ${paidOrders} سفارش PAID (${paidCoins} سکه، ${paidToman.toLocaleString("en-US")} تومان) با پول واقعی پرداخت شده‌اند` +
        " و بخشی از صندوق جایزه‌اند. با بازنشانی، این سفارش‌ها پاک و سکه‌های خریداری‌شده از کیف‌ها حذف می‌شوند."
    );
    if (!INCLUDE_PAID_ORDERS) {
      console.error("!! بازنشانی انجام نشد. اول از جدول CoinOrder خروجی بگیرید و اگر مطمئنید --include-paid-orders را اضافه کنید.");
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  const counts = {
    dueDiligenceMessage: await prisma.dueDiligenceMessage.count(),
    investment: await prisma.investment.count(),
    purchase: await prisma.purchase.count(),
    heart: await prisma.heart.count(),
    bid: await prisma.bid.count(),
    adSlotBid: await prisma.adSlotBid.count(),
    auction: await prisma.auction.count(),
    product: await prisma.product.count(),
    idea: await prisma.idea.count(),
    adSlot: await prisma.adSlot.count(),
    ledgerEntry: await prisma.ledgerEntry.count(),
    coinOrder: coinOrders,
    coinOrderPaid: paidOrders,
    teamScore: await prisma.teamScore.count(),
    collusionFlag: await prisma.collusionFlag.count(),
    teamLeaderVote: await prisma.teamLeaderVote.count(),
    notification: await prisma.notification.count(),
    surveyResponse: await prisma.surveyResponse.count(),
    teamInvite: KEEP_TEAMS ? 0 : await prisma.teamInvite.count(),
    team: KEEP_TEAMS ? 0 : await prisma.team.count(),
    user: await prisma.user.count(),
    announcement: WIPE_ANNOUNCEMENTS ? await prisma.announcement.count() : 0,
  };

  console.log("قبل از بازنشانی:");
  console.table(counts);

  await prisma.$transaction(async (tx) => {
    // ۱) رکوردهای فرزند که به Idea/Product/Auction/AdSlot وابسته‌اند.
    await tx.dueDiligenceMessage.deleteMany({});
    await tx.investment.deleteMany({});
    await tx.purchase.deleteMany({});
    await tx.heart.deleteMany({});
    await tx.bid.deleteMany({});
    await tx.adSlotBid.deleteMany({});

    // ۲) خودِ Auction/Product/Idea/AdSlot (بعد از پاک‌شدن فرزندانشان).
    await tx.auction.deleteMany({});
    await tx.product.deleteMany({});
    await tx.idea.deleteMany({});
    await tx.adSlot.deleteMany({});

    // ۳) دفتر کل، سفارش خرید سکه (فرزند User؛ کاربران می‌مانند)، امتیاز تیم، پرچم تبانی،
    //    رأی‌های قدیمی سرپرست، اعلان، نظرسنجی.
    await tx.ledgerEntry.deleteMany({});
    await tx.coinOrder.deleteMany({});
    await tx.teamScore.deleteMany({});
    await tx.collusionFlag.deleteMany({});
    await tx.teamLeaderVote.deleteMany({});
    await tx.notification.deleteMany({});
    await tx.surveyResponse.deleteMany({});

    // ۴) تیم‌ها و دعوت‌نامه‌ها — مگر --keep-teams.
    if (!KEEP_TEAMS) {
      // ابتدا teamId کاربران را null کنیم چون User.teamId به Team اشاره دارد.
      await tx.user.updateMany({ data: { teamId: null } });
      await tx.teamInvite.deleteMany({});
      await tx.team.deleteMany({});
    } else {
      // تیم‌ها می‌مانند ولی کسر امتیاز تقلب و ستون‌های قدیمی (خزانه/سرپرست) صفر می‌شوند.
      await tx.team.updateMany({
        data: { cheatPenalty: 0, cheatNote: "", treasury: 0, leaderId: null, leaderElectedAt: null },
      });
    }

    // ۵) کیف سکه و آمار کاربران.
    await tx.user.updateMany({
      data: {
        coffee: 5,
        bugs: 50,
        sleep: 7,
        confidence: 100,
        buyWallet: startingCoins,
        seedWallet: 0, // کیف بذر قدیمی
        powerUsed: false, // ستون‌های قدیمی قدرت‌ها
        shieldTeamId: null,
      },
    });

    // ۶) اعلانیه‌ها — فقط با --wipe-announcements.
    if (WIPE_ANNOUNCEMENTS) {
      await tx.announcement.deleteMany({});
    }

    // ۷) فاز بازی → REGISTRATION (همان الگوی src/lib/phase.ts / scripts/set-phase.ts).
    await tx.setting.upsert({
      where: { key: "phase" },
      update: { value: firstPhase },
      create: { key: "phase", value: firstPhase },
    });
    await tx.setting.upsert({
      where: { key: "phase_ends_at" },
      update: { value: "" },
      create: { key: "phase_ends_at", value: "" },
    });
    // ۸) وضعیت دور قبل (تسویه، انتخاب داوران، پرچم‌های یک‌باره) — دور بعدی از صفر شروع شود.
    await tx.setting.deleteMany({
      where: {
        OR: [{ key: { in: ROUND_STATE_KEYS } }, ...ROUND_STATE_PREFIXES.map((p) => ({ key: { startsWith: p } }))],
      },
    });
  });

  console.log(`بازنشانی انجام شد. فاز = ${firstPhase}. کیف سکهٔ همه = ${startingCoins}.`);
  console.log(KEEP_TEAMS ? "تیم‌ها و دعوت‌نامه‌ها حفظ شدند (--keep-teams)." : "تیم‌ها و دعوت‌نامه‌ها پاک شدند.");
  console.log(WIPE_ANNOUNCEMENTS ? "اعلانیه‌ها هم پاک شدند (--wipe-announcements)." : "اعلانیه‌ها حفظ شدند.");
  if (coinOrders > 0) console.log(`${coinOrders} سفارش خرید سکه پاک شد (${paidOrders} پرداخت‌شده).`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("!! بازنشانی با خطا مواجه شد:", err);
  process.exit(1);
});
