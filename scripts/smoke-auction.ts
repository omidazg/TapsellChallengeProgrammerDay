/**
 * دود-تست حراج زنده و حراج جایگاه تبلیغاتی.
 * اجرا: npx tsx scripts/smoke-auction.ts
 *
 * برای اینکه پایگاه دادهٔ اصلی دست‌نخورده بماند، یک کپی از `dev.db` در پوشهٔ موقت
 * ساخته می‌شود و `DATABASE_URL` پیش از بارگذاری Prisma به آن اشاره می‌کند.
 * در پایان، داده‌های آزمایشی پاک، فاز به REGISTRATION برگردانده و کپی حذف می‌شود.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DB = path.join(ROOT, "dev.db");
const TMP_DB = path.join(os.tmpdir(), `arena-smoke-${process.pid}.db`);

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

function eq(label: string, actual: unknown, expected: unknown) {
  check(label, Object.is(actual, expected), { actual, expected });
}

/** انتظار خطا از یک عملیات؛ در صورت موفق شدن، تست رد می‌شود. */
async function expectError(label: string, fn: () => Promise<unknown>, mustInclude?: string) {
  try {
    await fn();
    check(label, false, "بدون خطا اجرا شد");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(label, mustInclude ? msg.includes(mustInclude) : true, msg);
  }
}

async function main() {
  if (!fs.existsSync(SOURCE_DB)) {
    console.log("FAIL  dev.db پیدا نشد؛ ابتدا `npx prisma db push` را اجرا کنید.");
    process.exit(1);
  }
  fs.copyFileSync(SOURCE_DB, TMP_DB);
  process.env.DATABASE_URL = `file:${TMP_DB}`;

  // پس از تنظیم DATABASE_URL بارگذاری می‌شوند (Prisma آدرس را در زمان import می‌خواند).
  const { prisma } = await import("../src/lib/db");
  const { setPhase } = await import("../src/lib/phase");
  const {
    ensureAuctions,
    startNextAuction,
    placeBid,
    settleIfEnded,
    activateSecondWind,
    currentOrNextAuctionId,
  } = await import("../src/lib/auction");
  const { ensureAdSlots, upsertBid, closeSlot } = await import("../src/lib/adslots");

  try {
    // ---------- پاکسازی کپی برای قطعیت نتیجه ----------
    await prisma.bid.deleteMany({});
    await prisma.auction.deleteMany({});
    await prisma.adSlotBid.deleteMany({});
    await prisma.adSlot.deleteMany({});
    await prisma.purchase.deleteMany({});
    await prisma.heart.deleteMany({});
    await prisma.ledgerEntry.deleteMany({});
    await prisma.investment.deleteMany({});
    await prisma.dueDiligenceMessage.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.idea.deleteMany({});
    await prisma.teamScore.deleteMany({});
    await prisma.collusionFlag.deleteMany({});
    await prisma.teamInvite.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.team.deleteMany({});

    // ---------- چیدمان: ۲ تیم، ۳ کاربر، ۲ محصول ثبت‌شده ----------
    const teamA = await prisma.team.create({ data: { name: "تیم الف", slug: "smoke-a", treasury: 100 } });
    const teamB = await prisma.team.create({ data: { name: "تیم ب", slug: "smoke-b", treasury: 100 } });

    const a1 = await prisma.user.create({
      data: { email: "smoke-a1@test.local", passwordHash: "x", nickname: "الف‌یک", role: "BUILDER", power: "SHIELD", teamId: teamA.id, buyWallet: 100 },
    });
    const a2 = await prisma.user.create({
      data: { email: "smoke-a2@test.local", passwordHash: "x", nickname: "الف‌دو", role: "DEALMAKER", power: "SECOND_WIND", teamId: teamA.id, buyWallet: 100 },
    });
    const b1 = await prisma.user.create({
      data: { email: "smoke-b1@test.local", passwordHash: "x", nickname: "ب‌یک", role: "DEALMAKER", power: "BARGAIN", teamId: teamB.id, buyWallet: 100 },
    });

    const t0 = new Date(Date.now() - 60_000);
    const productA = await prisma.product.create({
      data: { teamId: teamA.id, name: "محصول الف", specialName: "ویژهٔ الف", specialStart: 20, submittedAt: t0 },
    });
    const productB = await prisma.product.create({
      data: { teamId: teamB.id, name: "محصول ب", specialName: "ویژهٔ ب", specialStart: 30, submittedAt: new Date(t0.getTime() + 1000) },
    });

    await setPhase("AUCTION", null);

    // ---------- ensureAuctions ----------
    await ensureAuctions();
    await ensureAuctions(); // idempotent
    const auctions = await prisma.auction.findMany({ orderBy: { order: "asc" } });
    eq("ensureAuctions: دقیقاً دو حراج (idempotent)", auctions.length, 2);
    eq("ensureAuctions: ترتیب بر اساس submittedAt", auctions[0]?.productId, productA.id);
    eq("ensureAuctions: order صفر و یک", `${auctions[0]?.order},${auctions[1]?.order}`, "0,1");
    eq("ensureAuctions: startPrice = specialStart (الف)", auctions[0]?.startPrice, 20);
    eq("ensureAuctions: startPrice = specialStart (ب)", auctions[1]?.startPrice, productB.specialStart);
    eq("ensureAuctions: وضعیت اولیه SCHEDULED", auctions[0]?.status, "SCHEDULED");

    // ---------- startNextAuction ----------
    const started = await startNextAuction(5);
    eq("startNextAuction: اولین حراج صف زنده شد", started?.id, auctions[0]?.id);
    eq("startNextAuction: وضعیت LIVE", started?.status, "LIVE");
    check("startNextAuction: startsAt و endsAt پر شد", !!started?.startsAt && !!started?.endsAt);
    const again = await startNextAuction(5);
    eq("startNextAuction: با وجود حراج زنده no-op است", again, null);
    eq("فقط یک حراج LIVE", await prisma.auction.count({ where: { status: "LIVE" } }), 1);
    eq("currentOrNextAuctionId: حراج زنده", await currentOrNextAuctionId(), auctions[0]!.id);

    const liveId = auctions[0]!.id;
    // زمان کافی برای مراحل بعدی (بدون افتادن در پنجرهٔ ضد-اسنایپ)
    await prisma.auction.update({ where: { id: liveId }, data: { endsAt: new Date(Date.now() + 600_000) } });

    // ---------- placeBid ----------
    await expectError("placeBid: پیشنهاد کمتر از حداقل رد می‌شود", () => placeBid(liveId, b1.id, 19), "حداقل");
    await expectError("placeBid: پیشنهاد تیم خودی رد می‌شود", () => placeBid(liveId, a1.id, 25), "تیم خودت");
    await placeBid(liveId, b1.id, 20);
    eq("placeBid: پیشنهاد معتبر ثبت شد", await prisma.bid.count({ where: { auctionId: liveId } }), 1);
    await expectError("placeBid: تکرار همان مبلغ توسط بالاترین پیشنهاددهنده رد می‌شود", () => placeBid(liveId, b1.id, 20));
    await expectError("placeBid: افزایش کمتر از bid_increment رد می‌شود", () => placeBid(liveId, b1.id, 21), "حداقل");
    await placeBid(liveId, b1.id, 22); // بالا بردن پیشنهاد خود مجاز است
    eq("placeBid: بالا بردن پیشنهاد خود پذیرفته شد", await prisma.bid.count({ where: { auctionId: liveId } }), 2);
    await expectError("placeBid: بیش از موجودی کیف خرید رد می‌شود", () => placeBid(liveId, b1.id, 500), "کیف خرید");

    // ---------- ضد-اسنایپ ----------
    const beforeSnipe = await prisma.auction.update({
      where: { id: liveId },
      data: { endsAt: new Date(Date.now() + 10_000), extensions: 0 },
    });
    await placeBid(liveId, b1.id, 24);
    const afterSnipe = await prisma.auction.findUniqueOrThrow({ where: { id: liveId } });
    eq("ضد-اسنایپ: extensions افزایش یافت", afterSnipe.extensions, 1);
    const delta = afterSnipe.endsAt!.getTime() - beforeSnipe.endsAt!.getTime();
    eq("ضد-اسنایپ: endsAt شصت ثانیه تمدید شد", delta, 60_000);

    // ---------- نفس دوم ----------
    const beforeWind = await prisma.auction.findUniqueOrThrow({ where: { id: liveId } });
    await activateSecondWind(liveId, a2.id);
    const afterWind = await prisma.auction.findUniqueOrThrow({ where: { id: liveId } });
    eq("نفس دوم: ۱۲۰ ثانیه تمدید", afterWind.endsAt!.getTime() - beforeWind.endsAt!.getTime(), 120_000);
    eq("نفس دوم: powerUsed شد", (await prisma.user.findUniqueOrThrow({ where: { id: a2.id } })).powerUsed, true);
    await expectError("نفس دوم: بار دوم رد می‌شود", () => activateSecondWind(liveId, a2.id), "قبلاً");

    // ---------- settleIfEnded ----------
    eq("settleIfEnded: پیش از پایان زمان، کاری نمی‌کند", await settleIfEnded(liveId), false);
    await prisma.auction.update({ where: { id: liveId }, data: { endsAt: new Date(Date.now() - 1000) } });
    eq("settleIfEnded: تسویه انجام شد", await settleIfEnded(liveId), true);
    eq("settleIfEnded: فراخوانی دوم idempotent است", await settleIfEnded(liveId), false);

    const settledAuction = await prisma.auction.findUniqueOrThrow({ where: { id: liveId } });
    eq("تسویه: وضعیت ENDED", settledAuction.status, "ENDED");
    eq("تسویه: برنده درست است", settledAuction.winnerId, b1.id);
    eq("تسویه: قیمت نهایی = بالاترین پیشنهاد", settledAuction.finalPrice, 24);

    const purchases = await prisma.purchase.findMany({ where: { productId: productA.id } });
    eq("تسویه: دقیقاً یک Purchase (بدون خرید دوباره)", purchases.length, 1);
    eq("تسویه: Purchase به نام برنده", purchases[0]?.userId, b1.id);
    eq("تسویه: مبلغ Purchase", purchases[0]?.amount, 24);
    eq("تسویه: تخفیف صفر", purchases[0]?.discount, 0);

    const ledger = await prisma.ledgerEntry.findMany({ where: { refId: liveId, reason: "AUCTION_WIN" } });
    eq("تسویه: دقیقاً یک LedgerEntry با reason=AUCTION_WIN", ledger.length, 1);
    eq("تسویه: کیف BUY", ledger[0]?.wallet, "BUY");
    eq("تسویه: delta منفی قیمت نهایی", ledger[0]?.delta, -24);

    eq("تسویه: کیف خرید برنده کم شد", (await prisma.user.findUniqueOrThrow({ where: { id: b1.id } })).buyWallet, 76);

    const next = await prisma.auction.findUniqueOrThrow({ where: { id: auctions[1]!.id } });
    eq("تسویه: حراج بعدی خودکار زنده شد", next.status, "LIVE");
    eq("پس از تسویه هم فقط یک حراج LIVE", await prisma.auction.count({ where: { status: "LIVE" } }), 1);

    await expectError("placeBid روی حراج پایان‌یافته رد می‌شود", () => placeBid(liveId, b1.id, 40), "زنده");

    // حراج بدون پیشنهاد: پایان بدون برنده
    await prisma.auction.update({ where: { id: next.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    eq("حراج بدون پیشنهاد: تسویه شد", await settleIfEnded(next.id), true);
    const noBid = await prisma.auction.findUniqueOrThrow({ where: { id: next.id } });
    eq("حراج بدون پیشنهاد: ENDED", noBid.status, "ENDED");
    eq("حراج بدون پیشنهاد: بدون برنده", noBid.winnerId, null);

    // ---------- جایگاه‌های تبلیغاتی ----------
    const marketStart = new Date(Date.now() + 24 * 60 * 60 * 1000); // فردا، تا due نشوند
    marketStart.setMinutes(0, 0, 0);
    await ensureAdSlots(marketStart, 2);
    await ensureAdSlots(marketStart, 2); // idempotent
    const slots = await prisma.adSlot.findMany({ orderBy: [{ hourStart: "asc" }, { kind: "asc" }] });
    eq("ensureAdSlots: ۲ ساعت × ۳ نوع = ۶ جایگاه (idempotent)", slots.length, 6);

    const [s1, s2, s3, s4] = slots;

    // دو تیم روی یک جایگاه: ۳۰ و ۲۰ → برنده الف، پرداخت ۲۰ (قیمت دوم)
    await upsertBid(s1!.id, teamA.id, 30);
    await upsertBid(s1!.id, teamB.id, 20);
    const closed1 = await closeSlot(s1!.id);
    eq("closeSlot: برنده بالاترین پیشنهاد", closed1?.winnerTeamId, teamA.id);
    eq("closeSlot: پرداخت = دومین پیشنهاد", closed1?.pricePaid, 20);
    eq("closeSlot: وضعیت CLOSED", closed1?.status, "CLOSED");
    eq("closeSlot: خزانهٔ برنده کم شد", (await prisma.team.findUniqueOrThrow({ where: { id: teamA.id } })).treasury, 80);
    const adLedger = await prisma.ledgerEntry.findMany({ where: { refId: s1!.id, reason: "ADSLOT" } });
    eq("closeSlot: LedgerEntry خزانه", adLedger.length, 1);
    eq("closeSlot: delta خزانه", `${adLedger[0]?.wallet}/${adLedger[0]?.delta}`, "TREASURY/-20");
    eq("closeSlot: فراخوانی دوم idempotent است", await closeSlot(s1!.id), null);
    eq("closeSlot: خزانه بار دوم کم نشد", (await prisma.team.findUniqueOrThrow({ where: { id: teamA.id } })).treasury, 80);

    // تک‌پیشنهادی: یک سکهٔ نمادین
    await upsertBid(s2!.id, teamB.id, 15);
    const closed2 = await closeSlot(s2!.id);
    eq("closeSlot: تک‌پیشنهادی یک سکه می‌دهد", closed2?.pricePaid, 1);
    eq("closeSlot: خزانهٔ تک‌پیشنهادی", (await prisma.team.findUniqueOrThrow({ where: { id: teamB.id } })).treasury, 99);

    // جایگاه بدون پیشنهاد
    const closed3 = await closeSlot(s3!.id);
    eq("closeSlot: جایگاه بدون پیشنهاد بسته و بدون برنده", `${closed3?.status}/${closed3?.winnerTeamId}`, "CLOSED/null");

    // سقف تعهد: مجموع پیشنهادهای باز نباید از خزانه بیشتر شود
    await prisma.team.update({ where: { id: teamB.id }, data: { treasury: 25 } });
    await upsertBid(s4!.id, teamB.id, 20);
    const s5 = slots[4]!;
    await expectError("upsertBid: مجموع تعهد بیش از خزانه رد می‌شود", () => upsertBid(s5.id, teamB.id, 10), "خزانه");
    await upsertBid(s5.id, teamB.id, 5); // ۲۰ + ۵ = ۲۵ ≤ خزانه
    eq("upsertBid: تعهد برابر خزانه پذیرفته می‌شود", (await prisma.adSlotBid.findFirstOrThrow({ where: { slotId: s5.id, teamId: teamB.id } })).amount, 5);
    await upsertBid(s4!.id, teamB.id, 20); // ویرایش همان پیشنهاد نباید دوباره حساب شود
    eq("upsertBid: ویرایش پیشنهاد همان جایگاه دوباره شمرده نمی‌شود", await prisma.adSlotBid.count({ where: { slotId: s4!.id, teamId: teamB.id } }), 1);
    await expectError("upsertBid: مبلغ صفر/منفی رد می‌شود", () => upsertBid(s5.id, teamB.id, 0), "دست‌کم یک سکه");
    await expectError("upsertBid: مبلغ اعشاری رد می‌شود", () => upsertBid(s5.id, teamB.id, 2.5), "عدد صحیح");
    await expectError("upsertBid: جایگاه بسته‌شده رد می‌شود", () => upsertBid(s1!.id, teamB.id, 5), "بسته");
  } finally {
    // ---------- پاکسازی ----------
    try {
      const { setPhase } = await import("../src/lib/phase");
      await setPhase("REGISTRATION", null);
      const { prisma } = await import("../src/lib/db");
      await prisma.$disconnect();
    } catch {
      /* پاکسازی بهترین‌تلاش */
    }
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      try {
        fs.rmSync(TMP_DB + suffix, { force: true });
      } catch {
        /* نادیده */
      }
    }
  }

  console.log("");
  console.log(`نتیجه: ${passed} PASS · ${failed} FAIL`);
  console.log(failed === 0 ? "SMOKE: PASS" : "SMOKE: FAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE: FAIL — خطای غیرمنتظره");
  console.error(e);
  process.exit(1);
});
