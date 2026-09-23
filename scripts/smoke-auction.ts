/**
 * دود-تست حراج زنده و حراج جایگاه تبلیغاتی.
 * اجرا: npx tsx scripts/smoke-auction.ts
 *
 * برای اینکه پایگاه دادهٔ اصلی دست‌نخورده بماند، یک کپی از `dev.db` در پوشهٔ موقت
 * ساخته می‌شود و `DATABASE_URL` پیش از بارگذاری Prisma به آن اشاره می‌کند.
 * در پایان، داده‌های آزمایشی پاک، فاز به REGISTRATION برگردانده و کپی حذف می‌شود.
 */

import fs from "node:fs";
import { createTempDb } from "./lib/temp-db";

let TMP_DB = "";

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
  // اسکیما از روی مایگریشن‌ها ساخته می‌شود، نه با کپی از dev.db: روی CI
  // اصلاً dev.db وجود ندارد. createTempDb خودش DATABASE_URL را هم تنظیم می‌کند
  // (باید پیش از import شدن prisma باشد).
  TMP_DB = createTempDb("smoke-auction").file;

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
    shuffleOrder,
    clampAuctionDuration,
  } = await import("../src/lib/auction");
  const { ensureAdSlots, upsertBid, closeSlot } = await import("../src/lib/adslots");
  const { DEFAULTS } = await import("../src/lib/constants");

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
    await prisma.notification.deleteMany({});
    await prisma.pushSubscription.deleteMany({});
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
    // ترتیب صف تصادفی است (shuffleOrder)، پس فقط عضویت/پوشش را چک می‌کنیم، نه جایگاه دقیق.
    eq(
      "ensureAuctions: هر دو محصول در صف هستند",
      [...auctions.map((a) => a.productId)].sort().join(","),
      [productA.id, productB.id].sort().join(",")
    );
    eq("ensureAuctions: order صفر و یک", `${auctions[0]?.order},${auctions[1]?.order}`, "0,1");
    eq(
      "ensureAuctions: startPrice برابر specialStart هر محصول است",
      auctions.map((a) => a.startPrice).sort((x, y) => x - y).join(","),
      [productA.specialStart, productB.specialStart].sort((x, y) => x - y).join(",")
    );
    eq("ensureAuctions: وضعیت اولیه SCHEDULED", auctions[0]?.status, "SCHEDULED");

    // ---------- shuffleOrder: جابه‌جایی Fisher–Yates (تابع خالص) ----------
    {
      const original = Array.from({ length: 8 }, (_, i) => i);
      const shuffled = shuffleOrder([...original]);
      eq("shuffleOrder: طول آرایه ثابت می‌ماند", shuffled.length, original.length);
      eq(
        "shuffleOrder: جایگشتی از همان عناصر است",
        [...shuffled].sort((a, b) => a - b).join(","),
        original.join(",")
      );
      // با ۲۰۰ بار اجرا روی آرایهٔ ۶تایی، احتمال این‌که همیشه دقیقاً همان ترتیب اولیه برگردد عملاً صفر است.
      let sawDifferentOrder = false;
      for (let i = 0; i < 200; i++) {
        if (shuffleOrder([0, 1, 2, 3, 4, 5]).join(",") !== "0,1,2,3,4,5") {
          sawDifferentOrder = true;
          break;
        }
      }
      check("shuffleOrder: واقعاً ترتیب را به‌هم می‌ریزد (آماری، ۲۰۰ تلاش)", sawDifferentOrder);
    }

    // ---------- clampAuctionDuration: محاسبهٔ خالص مدت حراج ----------
    {
      eq("clampAuctionDuration: با زمان کافی، مدت پیکربندی‌شده حفظ می‌شود", clampAuctionDuration(10_000, 2, 300), 300);
      eq(
        "clampAuctionDuration: با زمان کم، متناسب با تعداد صف کوتاه می‌شود",
        clampAuctionDuration(600, 5, 300),
        Math.max(60, Math.floor((600 * 0.85) / 5))
      );
      eq("clampAuctionDuration: هرگز از ۶۰ ثانیه کمتر نمی‌شود", clampAuctionDuration(10, 10, 300), 60);
      eq("clampAuctionDuration: هرگز از مدت پیکربندی‌شده بیشتر نمی‌شود", clampAuctionDuration(1_000_000, 1, 300), 300);
      eq("clampAuctionDuration: بدون حراج باقی‌مانده، حداقل مطلق برمی‌گردد", clampAuctionDuration(1000, 0, 300), 60);
      eq("clampAuctionDuration: زمان صفر/منفی هم حداقل مطلق می‌دهد", clampAuctionDuration(0, 3, 300), 60);
    }

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
    // چون ترتیب صف حراج تصادفی است (شافل)، از قبل معلوم نیست محصول کدام تیم زودتر زنده می‌شود؛
    // پس «خریدار» (عضو تیم مقابل) و «عضو تیم خودی» (که باید رد شود) را بر اساس تیم صاحبِ حراج زنده تعیین می‌کنیم.
    const liveAuctionMeta = auctions.find((a) => a.id === liveId)!;
    const liveIsProductA = liveAuctionMeta.productId === productA.id;
    const bidder = liveIsProductA ? b1 : a1;
    const ownTeamUser = liveIsProductA ? a1 : b1;
    // قیمت پایه و گام پیشنهاد هم به محصول زنده بستگی دارد (productA و productB مقدار specialStart متفاوتی دارند)،
    // پس نردبان مبلغ‌های تست را نسبت به آن‌ها می‌سازیم، نه با عدد ثابت.
    const start = liveAuctionMeta.startPrice;
    const inc = DEFAULTS.bidIncrement;
    // زمان کافی برای مراحل بعدی (بدون افتادن در پنجرهٔ ضد-اسنایپ)
    await prisma.auction.update({ where: { id: liveId }, data: { endsAt: new Date(Date.now() + 600_000) } });

    // ---------- placeBid ----------
    await expectError("placeBid: پیشنهاد کمتر از حداقل رد می‌شود", () => placeBid(liveId, bidder.id, start - 1), "حداقل");
    await expectError("placeBid: پیشنهاد تیم خودی رد می‌شود", () => placeBid(liveId, ownTeamUser.id, start + 5), "تیم خودت");
    await placeBid(liveId, bidder.id, start);
    eq("placeBid: پیشنهاد معتبر ثبت شد", await prisma.bid.count({ where: { auctionId: liveId } }), 1);
    await expectError("placeBid: تکرار همان مبلغ توسط بالاترین پیشنهاددهنده رد می‌شود", () => placeBid(liveId, bidder.id, start));
    await expectError("placeBid: افزایش کمتر از bid_increment رد می‌شود", () => placeBid(liveId, bidder.id, start + 1), "حداقل");
    await placeBid(liveId, bidder.id, start + inc); // بالا بردن پیشنهاد خود مجاز است
    eq("placeBid: بالا بردن پیشنهاد خود پذیرفته شد", await prisma.bid.count({ where: { auctionId: liveId } }), 2);
    await expectError("placeBid: بیش از موجودی کیف خرید رد می‌شود", () => placeBid(liveId, bidder.id, 500), "کیف خرید");

    // ---------- ضد-اسنایپ ----------
    const beforeSnipe = await prisma.auction.update({
      where: { id: liveId },
      data: { endsAt: new Date(Date.now() + 10_000), extensions: 0 },
    });
    const finalBid = start + 2 * inc;
    await placeBid(liveId, bidder.id, finalBid);
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
    eq("تسویه: برنده درست است", settledAuction.winnerId, bidder.id);
    eq("تسویه: قیمت نهایی = بالاترین پیشنهاد", settledAuction.finalPrice, finalBid);

    const purchases = await prisma.purchase.findMany({ where: { productId: liveAuctionMeta.productId } });
    eq("تسویه: دقیقاً یک Purchase (بدون خرید دوباره)", purchases.length, 1);
    eq("تسویه: Purchase به نام برنده", purchases[0]?.userId, bidder.id);
    eq("تسویه: مبلغ Purchase", purchases[0]?.amount, finalBid);
    eq("تسویه: تخفیف صفر", purchases[0]?.discount, 0);

    const ledger = await prisma.ledgerEntry.findMany({ where: { refId: liveId, reason: "AUCTION_WIN" } });
    eq("تسویه: دقیقاً یک LedgerEntry با reason=AUCTION_WIN", ledger.length, 1);
    eq("تسویه: کیف BUY", ledger[0]?.wallet, "BUY");
    eq("تسویه: delta منفی قیمت نهایی", ledger[0]?.delta, -finalBid);

    eq("تسویه: کیف خرید برنده کم شد", (await prisma.user.findUniqueOrThrow({ where: { id: bidder.id } })).buyWallet, 100 - finalBid);

    const next = await prisma.auction.findUniqueOrThrow({ where: { id: auctions[1]!.id } });
    eq("تسویه: حراج بعدی خودکار زنده شد", next.status, "LIVE");
    eq("پس از تسویه هم فقط یک حراج LIVE", await prisma.auction.count({ where: { status: "LIVE" } }), 1);

    await expectError("placeBid روی حراج پایان‌یافته رد می‌شود", () => placeBid(liveId, bidder.id, 40), "زنده");

    // حراج بدون پیشنهاد: پایان بدون برنده
    await prisma.auction.update({ where: { id: next.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    eq("حراج بدون پیشنهاد: تسویه شد", await settleIfEnded(next.id), true);
    const noBid = await prisma.auction.findUniqueOrThrow({ where: { id: next.id } });
    eq("حراج بدون پیشنهاد: ENDED", noBid.status, "ENDED");
    eq("حراج بدون پیشنهاد: بدون برنده", noBid.winnerId, null);

    // ---------- یکپارچه‌سازی: startNextAuction بدون durationSec صریح، مدت را با زمان فاز کلمپ می‌کند ----------
    {
      await prisma.setting.upsert({
        where: { key: "auction_duration_sec" },
        update: { value: "300" },
        create: { key: "auction_duration_sec", value: "300" },
      });
      const phaseEndsAt = new Date(Date.now() + 100_000); // ۱۰۰ ثانیه تا پایان فاز
      await setPhase("AUCTION", phaseEndsAt);

      // تیم جداگانه چون هر تیم فقط می‌تواند یک محصول داشته باشد (teamA و teamB قبلاً محصول دارند).
      const teamC = await prisma.team.create({ data: { name: "تیم پ", slug: "smoke-c", treasury: 100 } });
      const productC = await prisma.product.create({
        data: { teamId: teamC.id, name: "محصول پ", specialName: "ویژهٔ پ", specialStart: 10, submittedAt: new Date() },
      });
      await ensureAuctions();
      const scheduledBefore = await prisma.auction.count({ where: { status: "SCHEDULED" } });
      const startedFit = await startNextAuction(); // durationSec داده نشده → از تنظیم + کلمپ فاز استفاده می‌کند

      check("startNextAuction: بدون durationSec صریح، حراج بعدی زنده شد", !!startedFit && !!startedFit.startsAt && !!startedFit.endsAt);
      if (startedFit?.startsAt && startedFit?.endsAt) {
        const actualDur = Math.round((startedFit.endsAt.getTime() - startedFit.startsAt.getTime()) / 1000);
        const expectedDur = clampAuctionDuration(100, scheduledBefore, 300);
        check(
          "startNextAuction: مدت واقعی با clampAuctionDuration(زمان باقی‌ماندهٔ فاز، صف، مدت تنظیم‌شده) هم‌خوان است",
          Math.abs(actualDur - expectedDur) <= 2,
          { actualDur, expectedDur, scheduledBefore }
        );
        check("startNextAuction: مدت کلمپ‌شده کمتر از مدت پیکربندی‌شدهٔ ۳۰۰ ثانیه است", actualDur < 300, { actualDur });
        await settleAuctionCleanup(startedFit.id);
      }
      void productC;

      async function settleAuctionCleanup(id: string) {
        await prisma.auction.update({ where: { id }, data: { endsAt: new Date(Date.now() - 1000) } });
        await settleIfEnded(id);
      }

      // فاز را به حالت بدون endsAt برگردان تا رفتار بقیهٔ اسکریپت (و پاک‌سازی پایانی) تغییر نکند.
      await setPhase("AUCTION", null);
    }

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
