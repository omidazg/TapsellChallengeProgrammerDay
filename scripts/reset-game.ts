/**
 * بازنشانی کامل بازی برای اجرای یک دور تازه (rehearsal یا event day دوباره).
 *
 * اجرا:
 *   npx tsx scripts/reset-game.ts --yes
 *   npx tsx scripts/reset-game.ts --yes --keep-teams
 *   npx tsx scripts/reset-game.ts --yes --wipe-announcements
 *
 * چه‌کار می‌کند:
 *   - پاک می‌کند: ایده‌ها، سرمایه‌گذاری‌ها، پیام‌های due-diligence، محصولات،
 *     خریدها، لایک‌ها (Heart)، حراج‌ها، پیشنهادها (Bid)، جایگاه‌های تبلیغاتی
 *     و پیشنهادهایشان (AdSlot/AdSlotBid)، دفتر کل (LedgerEntry)، امتیاز
 *     تیم‌ها (TeamScore)، پرچم‌های تبانی (CollusionFlag)، اعلان‌ها
 *     (Notification) و پاسخ‌های نظرسنجی پایان بازی (SurveyResponse).
 *   - تیم‌ها و دعوت‌نامه‌ها (TeamInvite) هم پاک می‌شوند مگر --keep-teams.
 *   - کیف پول و آمار کاربران (coffee/bugs/sleep/confidence/seedWallet/
 *     buyWallet) به مقدار پیش‌فرض schema و powerUsed=false برمی‌گردد.
 *   - کاربران، ادمین‌ها، Setting‌ها و Announcement‌ها دست‌نخورده می‌مانند
 *     (Announcement فقط با --wipe-announcements پاک می‌شود).
 *   - فاز بازی به REGISTRATION برمی‌گردد (phase_ends_at پاک می‌شود).
 *
 * ایمنی:
 *   - بدون --yes هیچ کاری انجام نمی‌شود (dry بودن پیش‌فرض).
 *   - اگر NODE_ENV=production باشد و ALLOW_RESET=1 ست نشده باشد، امتناع
 *     می‌کند (برای جلوگیری از پاک کردن تصادفی دادهٔ رویداد واقعی).
 *   - همه چیز در یک تراکنش Prisma اجرا می‌شود؛ اگر جایی خطا بدهد، هیچ‌چیز
 *     تغییر نمی‌کند.
 */
import { createRequire } from "node:module";
import path from "node:path";

// `src/lib/db` (و ماژول‌های وابسته) ممکن است `server-only` را import کنند
// که بیرون از Next خطا می‌دهد. مثل scripts/backfill-treasury-ledger.ts آن
// را قبل از import واقعی خنثی می‌کنیم.
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

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_RESET !== "1") {
    console.error("!! NODE_ENV=production است. برای اجرا در تولید باید ALLOW_RESET=1 ست شود.");
    process.exit(1);
  }
  if (!YES) {
    console.error("!! این اسکریپت همهٔ دادهٔ بازی را پاک می‌کند. برای تأیید --yes را اضافه کنید.");
    console.error("   گزینه‌های اختیاری: --keep-teams  --wipe-announcements");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/db");
  const { PHASES } = await import("../src/lib/phases");
  void PHASES; // فقط برای اطمینان از این‌که ماژول فاز به‌درستی لود می‌شود

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
    teamScore: await prisma.teamScore.count(),
    collusionFlag: await prisma.collusionFlag.count(),
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

    // ۳) دفتر کل، امتیاز تیم، پرچم تبانی، اعلان، نظرسنجی — همه مستقل.
    await tx.ledgerEntry.deleteMany({});
    await tx.teamScore.deleteMany({});
    await tx.collusionFlag.deleteMany({});
    await tx.notification.deleteMany({});
    await tx.surveyResponse.deleteMany({});

    // ۴) تیم‌ها و دعوت‌نامه‌ها — مگر --keep-teams.
    if (!KEEP_TEAMS) {
      // ابتدا teamId کاربران را null کنیم چون User.teamId به Team اشاره دارد.
      await tx.user.updateMany({ data: { teamId: null } });
      await tx.teamInvite.deleteMany({});
      await tx.team.deleteMany({});
    }

    // ۵) کیف پول و آمار کاربران به مقدار پیش‌فرض schema.
    await tx.user.updateMany({
      data: {
        coffee: 5,
        bugs: 50,
        sleep: 7,
        confidence: 100,
        seedWallet: 100,
        buyWallet: 100,
        powerUsed: false,
      },
    });

    // ۶) اعلانیه‌ها — فقط با --wipe-announcements.
    if (WIPE_ANNOUNCEMENTS) {
      await tx.announcement.deleteMany({});
    }

    // ۷) فاز بازی → REGISTRATION (همان الگوی src/lib/phase.ts / scripts/set-phase.ts).
    await tx.setting.upsert({
      where: { key: "phase" },
      update: { value: "REGISTRATION" },
      create: { key: "phase", value: "REGISTRATION" },
    });
    await tx.setting.upsert({
      where: { key: "phase_ends_at" },
      update: { value: "" },
      create: { key: "phase_ends_at", value: "" },
    });
  });

  console.log("بازنشانی انجام شد. فاز = REGISTRATION.");
  console.log(KEEP_TEAMS ? "تیم‌ها و دعوت‌نامه‌ها حفظ شدند (--keep-teams)." : "تیم‌ها و دعوت‌نامه‌ها پاک شدند.");
  console.log(WIPE_ANNOUNCEMENTS ? "اعلانیه‌ها هم پاک شدند (--wipe-announcements)." : "اعلانیه‌ها حفظ شدند.");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("!! بازنشانی با خطا مواجه شد:", err);
  process.exit(1);
});
