/**
 * دود-تست حراج زنده.
 * اجرا: npx tsx scripts/smoke-auction.ts
 *
 * پوشش: فرستادن محصول به صف حراج توسط تیم (enqueueAuction) فقط وقتی بخش بازار باز است، بستن صف در
 * دقایق پایانی (auction_enqueue_cutoff_min)، شروع/پیشنهاد/ضد-اسنایپ/تسویه، شروع خودکار حراج
 * بعدی پس از تسویه (auto_auction)، رزرو سکهٔ پیشتاز، ابزار برگزارکننده ensureAuctions و
 * بسته شدن حراج‌ها در پایان بازی (transitionTo("CLOSED") → closeAuctionsForGameEnd).
 * حراج جایگاه تبلیغاتی دیگر وجود ندارد؛ خرید جایگاه با قیمت ثابت در smoke-coins آزموده می‌شود.
 *
 * برای اینکه پایگاه دادهٔ اصلی دست‌نخورده بماند، یک پایگاه‌دادهٔ موقت (createTempDb) ساخته می‌شود
 * و `DATABASE_URL` پیش از بارگذاری Prisma به آن اشاره می‌کند.
 */

import { createTempDb, type TempDb } from "./lib/temp-db";

let tempDb: TempDb | null = null;

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
  // اسکیما از روی مایگریشن‌ها ساخته می‌شود؛ createTempDb خودش DATABASE_URL را هم تنظیم می‌کند
  // (باید پیش از import شدن prisma باشد).
  tempDb = createTempDb("smoke-auction");

  // پس از تنظیم DATABASE_URL بارگذاری می‌شوند (Prisma آدرس را در زمان import می‌خواند).
  const { prisma } = await import("../src/lib/db");
  const { setPhase } = await import("../src/lib/phase");
  const { transitionTo } = await import("../src/lib/phase-transition");
  const {
    enqueueAuction,
    ensureAuctions,
    startNextAuction,
    placeBid,
    settleIfEnded,
    settleAuction,
    currentOrNextAuctionId,
    shuffleOrder,
    clampAuctionDuration,
    reservedBuyCoins,
    getBidBudget,
  } = await import("../src/lib/auction");
  const { getSettledAt } = await import("../src/lib/settlement");
  const { DEFAULTS } = await import("../src/lib/constants");

  const setSetting = (key: string, value: string) =>
    prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  const walletOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).buyWallet;

  let n = 0;
  const mkUser = (key: string, teamId: string | null, buyWallet = 100) =>
    prisma.user.create({
      data: {
        email: `smoke-auc-${key}-${n++}@test.local`,
        passwordHash: "x",
        nickname: `کاربر ${key}`,
        role: "DEALMAKER",
        power: "",
        teamId,
        seedWallet: 0,
        buyWallet,
      },
    });
  const mkTeamWithProduct = async (key: string, specialStart: number, opts: { solo?: boolean; submitted?: boolean } = {}) => {
    const team = await prisma.team.create({ data: { name: `تیم ${key}`, slug: `smoke-auc-${key}`, solo: opts.solo ?? false } });
    const product = await prisma.product.create({
      data: {
        teamId: team.id,
        slug: `smoke-auc-${key}-general`,
        name: `محصول ${key}`,
        specialName: `ویژهٔ ${key}`,
        specialStart,
        submittedAt: opts.submitted === false ? null : new Date(),
      },
    });
    return { team, product };
  };

  try {
    // ---------- توابع خالص ----------
    {
      const original = Array.from({ length: 8 }, (_, i) => i);
      const shuffled = shuffleOrder([...original]);
      eq("shuffleOrder: طول آرایه ثابت می‌ماند", shuffled.length, original.length);
      eq("shuffleOrder: جایگشتی از همان عناصر است", [...shuffled].sort((a, b) => a - b).join(","), original.join(","));
      let sawDifferentOrder = false;
      for (let i = 0; i < 200; i++) {
        if (shuffleOrder([0, 1, 2, 3, 4, 5]).join(",") !== "0,1,2,3,4,5") {
          sawDifferentOrder = true;
          break;
        }
      }
      check("shuffleOrder: واقعاً ترتیب را به‌هم می‌ریزد (آماری، ۲۰۰ تلاش)", sawDifferentOrder);

      eq("clampAuctionDuration: با زمان کافی، مدت پیکربندی‌شده حفظ می‌شود", clampAuctionDuration(10_000, 2, 300), 300);
      eq("clampAuctionDuration: با زمان کم، متناسب با تعداد صف کوتاه می‌شود", clampAuctionDuration(600, 5, 300), Math.max(60, Math.floor((600 * 0.85) / 5)));
      eq("clampAuctionDuration: هرگز از ۶۰ ثانیه کمتر نمی‌شود", clampAuctionDuration(10, 10, 300), 60);
      eq("clampAuctionDuration: هرگز از مدت پیکربندی‌شده بیشتر نمی‌شود", clampAuctionDuration(1_000_000, 1, 300), 300);
      eq("clampAuctionDuration: بدون حراج باقی‌مانده، حداقل مطلق برمی‌گردد", clampAuctionDuration(1000, 0, 300), 60);
      eq("clampAuctionDuration: زمان صفر/منفی هم حداقل مطلق می‌دهد", clampAuctionDuration(0, 3, 300), 60);
    }

    // ---------- چیدمان ----------
    const A = await mkTeamWithProduct("A", 20);
    const B = await mkTeamWithProduct("B", 30);
    const C = await mkTeamWithProduct("C", 0, { solo: true }); // شرکت فردی، specialStart صفر
    const X = await mkTeamWithProduct("X", 10, { submitted: false }); // محصول ثبت‌نشده
    const a1 = await mkUser("a1", A.team.id);
    const a2 = await mkUser("a2", A.team.id);
    const b1 = await mkUser("b1", B.team.id);
    const c1 = await mkUser("c1", C.team.id);
    const x1 = await mkUser("x1", X.team.id);
    const x2 = await mkUser("x2", X.team.id);
    const free = await mkUser("free", null);

    // ---------- صف حراج فقط وقتی بخش بازار باز است ----------
    const { setModuleStatus } = await import("../src/lib/module-state");
    await setPhase("LIVE", null);
    for (const status of ["ro", "closed", "hidden"] as const) {
      await setModuleStatus("market", status);
      const r = await enqueueAuction(a1.id, "general");
      check(`enqueueAuction: در وضعیت ${status} رد می‌شود`, !r.ok && r.error.includes("فعلاً باز نیست"), r);
    }
    eq("وقتی بخش بازار باز نیست هیچ حراجی ساخته نشد", await prisma.auction.count(), 0);
    await setModuleStatus("market", "open");

    await setPhase("LIVE", null);
    const noTeam = await enqueueAuction(free.id, "general");
    check("enqueueAuction: کاربر بی‌تیم رد می‌شود", !noTeam.ok && noTeam.error.includes("عضو یک تیم"), noTeam);
    const draft = await enqueueAuction(x1.id, "general");
    check("enqueueAuction: محصول ثبت‌نشده رد می‌شود", !draft.ok && draft.error.includes("ثبت نهایی"), draft);

    const qA = await enqueueAuction(a1.id, "general");
    check("enqueueAuction: تیم الف وارد صف شد (جایگاه ۱)", qA.ok && qA.position === 1, qA);
    const qA2 = await enqueueAuction(a2.id, "general");
    check("enqueueAuction: عضو دیگر همان تیم دوباره نمی‌تواند بفرستد", !qA2.ok && qA2.error.includes("قبلاً"), qA2);
    const qB = await enqueueAuction(b1.id, "general");
    check("enqueueAuction: تیم ب جایگاه ۲", qB.ok && qB.position === 2, qB);
    const qC = await enqueueAuction(c1.id, "general");
    check("enqueueAuction: شرکت فردی هم می‌تواند بفرستد (جایگاه ۳)", qC.ok && qC.position === 3, qC);

    const queue = await prisma.auction.findMany({ orderBy: { order: "asc" } });
    eq("صف: ترتیب همان ترتیب ثبت است", queue.map((a) => a.productId).join(","), [A.product.id, B.product.id, C.product.id].join(","));
    eq("صف: order صفر تا دو", queue.map((a) => a.order).join(","), "0,1,2");
    eq("صف: startPrice = specialStart", `${queue[0]?.startPrice},${queue[1]?.startPrice}`, "20,30");
    eq("صف: specialStart صفر → startPrice حداقل ۱", queue[2]?.startPrice, 1);
    check("صف: همه SCHEDULED", queue.every((a) => a.status === "SCHEDULED"));

    // ---------- بستن صف در دقایق پایانی مسابقه ----------
    const E = await mkTeamWithProduct("E", 10);
    const e1 = await mkUser("e1", E.team.id);
    await setPhase("LIVE", new Date(Date.now() + 10 * 60_000)); // ۱۰ دقیقه مانده؛ پیش‌فرض cutoff = ۲۰
    const late = await enqueueAuction(e1.id, "general");
    check(
      `enqueueAuction: در ${DEFAULTS.auctionEnqueueCutoffMin} دقیقهٔ پایانی صف بسته است`,
      !late.ok && late.error.includes("صف حراج بسته است"),
      late
    );
    await setSetting("auction_enqueue_cutoff_min", "5");
    const lateOk = await enqueueAuction(e1.id, "general");
    check("enqueueAuction: با cutoff=۵ دقیقه، ۱۰ دقیقه مانده پذیرفته می‌شود", lateOk.ok && lateOk.position === 4, lateOk);
    await prisma.setting.delete({ where: { key: "auction_enqueue_cutoff_min" } });
    await setPhase("LIVE", new Date(Date.now() + 60 * 60_000)); // یک ساعت مانده
    eq("enqueueAuction: با زمان کافی صف باز است (تکرار رد می‌شود چون قبلاً رفته)", (await enqueueAuction(e1.id, "general")).ok, false);
    await setPhase("LIVE", null);

    // ---------- startNextAuction ----------
    eq("currentOrNextAuctionId: پیش از شروع، اولین حراج صف", await currentOrNextAuctionId(), queue[0]!.id);
    const started = await startNextAuction(5);
    eq("startNextAuction: اولین حراج صف زنده شد", started?.id, queue[0]?.id);
    eq("startNextAuction: وضعیت LIVE", started?.status, "LIVE");
    check("startNextAuction: startsAt و endsAt پر شد", !!started?.startsAt && !!started?.endsAt);
    eq("startNextAuction: با وجود حراج زنده no-op است", await startNextAuction(5), null);
    eq("فقط یک حراج LIVE", await prisma.auction.count({ where: { status: "LIVE" } }), 1);
    eq("currentOrNextAuctionId: حراج زنده", await currentOrNextAuctionId(), queue[0]!.id);

    const liveId = queue[0]!.id;
    const start = queue[0]!.startPrice;
    const inc = DEFAULTS.bidIncrement;
    await prisma.auction.update({ where: { id: liveId }, data: { endsAt: new Date(Date.now() + 600_000) } });

    // ---------- placeBid ----------
    await expectError("placeBid: پیشنهاد کمتر از حداقل رد می‌شود", () => placeBid(liveId, b1.id, start - 1), "حداقل");
    await expectError("placeBid: پیشنهاد تیم خودی رد می‌شود", () => placeBid(liveId, a2.id, start + 5), "تیم خودت");
    await expectError("placeBid: مبلغ اعشاری رد می‌شود", () => placeBid(liveId, b1.id, start + 0.5), "نامعتبر");
    await placeBid(liveId, free.id, start); // کاربر بی‌تیم هم می‌تواند پیشنهاد بدهد
    await placeBid(liveId, b1.id, start + inc);
    eq("placeBid: دو پیشنهاد معتبر ثبت شد (بی‌تیم و تیم ب)", await prisma.bid.count({ where: { auctionId: liveId } }), 2);
    await expectError("placeBid: تکرار همان مبلغ توسط پیشتاز رد می‌شود", () => placeBid(liveId, b1.id, start + inc));
    await expectError("placeBid: افزایش کمتر از bid_increment رد می‌شود", () => placeBid(liveId, b1.id, start + inc + 1), "حداقل");
    await expectError("placeBid: بیش از موجودی رد می‌شود", () => placeBid(liveId, b1.id, 500), "قابل‌خرج");
    const budget = await getBidBudget(b1.id, liveId);
    eq("getBidBudget: پیشتازی در همین حراج از سکهٔ خرج‌پذیر کم نمی‌شود", budget?.spendable, 100);

    // ---------- ضد-اسنایپ ----------
    const beforeSnipe = await prisma.auction.update({
      where: { id: liveId },
      data: { endsAt: new Date(Date.now() + 10_000), extensions: 0 },
    });
    const finalBid = start + 2 * inc;
    await placeBid(liveId, b1.id, finalBid);
    const afterSnipe = await prisma.auction.findUniqueOrThrow({ where: { id: liveId } });
    eq("ضد-اسنایپ: extensions افزایش یافت", afterSnipe.extensions, 1);
    eq("ضد-اسنایپ: endsAt شصت ثانیه تمدید شد", afterSnipe.endsAt!.getTime() - beforeSnipe.endsAt!.getTime(), DEFAULTS.antiSnipeExtendSec * 1000);

    // ---------- تسویه + شروع خودکار حراج بعدی (auto_auction پیش‌فرض = ۱) ----------
    eq("settleIfEnded: پیش از پایان زمان، کاری نمی‌کند", await settleIfEnded(liveId), false);
    await prisma.auction.update({ where: { id: liveId }, data: { endsAt: new Date(Date.now() - 1000) } });
    eq("settleIfEnded: تسویه انجام شد", await settleIfEnded(liveId), true);
    eq("settleIfEnded: فراخوانی دوم idempotent است", await settleIfEnded(liveId), false);

    const settled = await prisma.auction.findUniqueOrThrow({ where: { id: liveId } });
    eq("تسویه: وضعیت ENDED", settled.status, "ENDED");
    eq("تسویه: برنده = بالاترین پیشنهاد", settled.winnerId, b1.id);
    eq("تسویه: قیمت نهایی = بالاترین پیشنهاد", settled.finalPrice, finalBid);
    const purchases = await prisma.purchase.findMany({ where: { productId: A.product.id } });
    eq("تسویه: دقیقاً یک Purchase به نام برنده با مبلغ کامل", `${purchases.length}/${purchases[0]?.userId === b1.id}/${purchases[0]?.amount}`, `1/true/${finalBid}`);
    const ledger = await prisma.ledgerEntry.findMany({ where: { refId: liveId, reason: "AUCTION_WIN" } });
    eq("تسویه: یک LedgerEntry BUY با delta منفی", `${ledger.length}/${ledger[0]?.wallet}/${ledger[0]?.delta}`, `1/BUY/${-finalBid}`);
    eq("تسویه: کیف برنده کم شد", await walletOf(b1.id), 100 - finalBid);
    eq("تسویه: از پیشنهاددهندهٔ بازنده چیزی کم نشد", await walletOf(free.id), 100);

    // حراج بعدی را تسویه شروع نمی‌کند؛ زمان‌بند پس از auction_gap_sec از last_auction_ended_at شروعش می‌کند.
    eq("پس از تسویه حراج بعدی هنوز SCHEDULED است (فاصله)", (await prisma.auction.findUniqueOrThrow({ where: { id: queue[1]!.id } })).status, "SCHEDULED");
    const endedAtSetting = await prisma.setting.findUnique({ where: { key: "last_auction_ended_at" } });
    check("تسویه: last_auction_ended_at ثبت شد", !!endedAtSetting && Date.now() - new Date(endedAtSetting.value).getTime() < 60_000, endedAtSetting);
    await startNextAuction(); // همان کاری که زمان‌بند پس از فاصله می‌کند
    const autoNext = await prisma.auction.findUniqueOrThrow({ where: { id: queue[1]!.id } });
    eq("شروع بعدی: حراج دومِ صف زنده شد", autoNext.status, "LIVE");
    eq("پس از تسویه هم فقط یک حراج LIVE", await prisma.auction.count({ where: { status: "LIVE" } }), 1);
    await expectError("placeBid روی حراج پایان‌یافته رد می‌شود", () => placeBid(liveId, free.id, 60), "زنده");

    // ---------- auto_auction=0: پس از تسویه حراج بعدی خودکار شروع نمی‌شود ----------
    await setSetting("auto_auction", "0");
    eq("تسویهٔ دستی حراج بدون پیشنهاد", await settleAuction(autoNext.id), true);
    const noBid = await prisma.auction.findUniqueOrThrow({ where: { id: autoNext.id } });
    eq("حراج بدون پیشنهاد: ENDED و بدون برنده", `${noBid.status}/${noBid.winnerId}`, "ENDED/null");
    eq("auto_auction=0: حراج بعدی SCHEDULED ماند", (await prisma.auction.findUniqueOrThrow({ where: { id: queue[2]!.id } })).status, "SCHEDULED");
    eq("auto_auction=0: هیچ حراج زنده‌ای نیست", await prisma.auction.count({ where: { status: "LIVE" } }), 0);

    // ---------- مدت حراج با زمان باقی‌ماندهٔ مسابقه کلمپ می‌شود ----------
    {
      await setSetting("auction_duration_sec", "300");
      await setPhase("LIVE", new Date(Date.now() + 100_000)); // ۱۰۰ ثانیه تا ددلاین
      const scheduledBefore = await prisma.auction.count({ where: { status: "SCHEDULED" } });
      const startedFit = await startNextAuction();
      check("startNextAuction: بدون durationSec صریح، حراج بعدی زنده شد", !!startedFit?.startsAt && !!startedFit?.endsAt);
      eq("startNextAuction: حراج شرکت فردی زنده شد", startedFit?.id, queue[2]!.id);
      if (startedFit?.startsAt && startedFit?.endsAt) {
        const actualDur = Math.round((startedFit.endsAt.getTime() - startedFit.startsAt.getTime()) / 1000);
        const expectedDur = clampAuctionDuration(100, scheduledBefore, 300);
        check("startNextAuction: مدت واقعی = clampAuctionDuration(زمان باقی‌مانده، صف، مدت تنظیم‌شده)", Math.abs(actualDur - expectedDur) <= 2, { actualDur, expectedDur, scheduledBefore });
        check("startNextAuction: مدت کلمپ‌شده کمتر از ۳۰۰ ثانیه است", actualDur < 300, { actualDur });
        await prisma.auction.update({ where: { id: startedFit.id }, data: { endsAt: new Date(Date.now() - 1000) } });
        await settleIfEnded(startedFit.id);
      }
      await prisma.setting.deleteMany({ where: { key: { in: ["auction_duration_sec", "auto_auction"] } } });
      await setPhase("LIVE", null);
    }

    // ---------- ابزار برگزارکننده ensureAuctions + رزرو سکهٔ پیشتاز ----------
    {
      const D1 = await mkTeamWithProduct("D1", 10);
      const D2 = await mkTeamWithProduct("D2", 10);
      const queuedBefore = await prisma.auction.count();
      await ensureAuctions();
      await ensureAuctions(); // idempotent
      eq("ensureAuctions: فقط محصولات ثبت‌شدهٔ بیرون از صف اضافه شدند (idempotent)", await prisma.auction.count(), queuedBefore + 2);
      eq("ensureAuctions: محصول ثبت‌نشده به صف نرفت", await prisma.auction.count({ where: { productId: X.product.id } }), 0);
      const aD = await prisma.auction.findUniqueOrThrow({ where: { productId: D1.product.id } });
      const aE = await prisma.auction.findUniqueOrThrow({ where: { productId: D2.product.id } });
      check("ensureAuctions: ته صف قرار گرفتند", aD.order > queue[2]!.order && aE.order > queue[2]!.order, { aD: aD.order, aE: aE.order });

      // دو حراج هم‌زمان زنده (فقط برای تست رزرو «جای دیگر»؛ در بازی واقعی یکی‌یکی زنده می‌شوند).
      const liveUntil = new Date(Date.now() + 600_000);
      for (const a of [aD, aE]) {
        await prisma.auction.update({ where: { id: a.id }, data: { status: "LIVE", startsAt: new Date(), endsAt: liveUntil } });
      }
      await placeBid(aD.id, x2.id, 10);
      await placeBid(aD.id, x1.id, 10 + inc);
      await placeBid(aD.id, x1.id, 10 + 2 * inc); // بالا بردن پیشنهاد خود رزرو را جایگزین می‌کند
      const leadD = 10 + 2 * inc;
      eq("رزرو: سکهٔ پیشتاز حراج زنده رزرو است", await prisma.$transaction((tx) => reservedBuyCoins(tx, x1.id)), leadD);
      eq("رزرو: حراج جاری کنار گذاشته می‌شود", await prisma.$transaction((tx) => reservedBuyCoins(tx, x1.id, aD.id)), 0);
      eq("رزرو: پیشنهاددهندهٔ شکسته‌شده رزروی ندارد", await prisma.$transaction((tx) => reservedBuyCoins(tx, x2.id)), 0);

      const spendable = 100 - leadD;
      await expectError("placeBid: بیش از سکهٔ قابل‌خرج (کیف منهای رزرو در حراج دیگر) رد می‌شود", () => placeBid(aE.id, x1.id, spendable + 1), "قابل‌خرج");
      await placeBid(aE.id, x1.id, spendable);
      eq("placeBid: پیشنهاد برابر سکهٔ قابل‌خرج پذیرفته می‌شود", await prisma.bid.count({ where: { auctionId: aE.id } }), 1);

      // موجودی پیشتاز از بیرون افت می‌کند (شبیه‌سازی): پیشنهادش در تسویه نامعتبر است.
      await prisma.user.update({ where: { id: x1.id }, data: { buyWallet: 5 } });
      await prisma.auction.update({ where: { id: aD.id }, data: { endsAt: new Date(Date.now() - 1000) } });
      eq("تسویهٔ بدون پشتوانه: تسویه شد", await settleIfEnded(aD.id), true);
      const settledD = await prisma.auction.findUniqueOrThrow({ where: { id: aD.id } });
      eq("تسویهٔ بدون پشتوانه: نفر معتبر بعدی برنده شد و دقیقاً پیشنهاد خودش را پرداخت", `${settledD.winnerId === x2.id}/${settledD.finalPrice}`, "true/10");
      eq("تسویهٔ بدون پشتوانه: کیف برنده ۹۰ شد", await walletOf(x2.id), 90);
      eq("تسویهٔ بدون پشتوانه: از پیشتاز بی‌پول چیزی کم نشد", await walletOf(x1.id), 5);
      eq("حراج دیگر هنوز زنده است، پس حراج تازه‌ای شروع نشد", await prisma.auction.count({ where: { status: "LIVE" } }), 1);

      // تنها پیشنهاد، بدون پشتوانه: پایان بدون برنده؛ سپس شروع خودکار حراج بعدی صف (تیم E).
      await prisma.auction.update({ where: { id: aE.id }, data: { endsAt: new Date(Date.now() - 1000) } });
      eq("تسویهٔ بدون پیشنهاد معتبر: تسویه شد", await settleIfEnded(aE.id), true);
      const settledE = await prisma.auction.findUniqueOrThrow({ where: { id: aE.id } });
      eq("تسویهٔ بدون پیشنهاد معتبر: بدون برنده و بدون خرید", `${settledE.winnerId}/${await prisma.purchase.count({ where: { productId: D2.product.id } })}`, "null/0");
      eq("پس از تسویه حراج تیم E هنوز SCHEDULED است (فاصله)", (await prisma.auction.findUniqueOrThrow({ where: { productId: E.product.id } })).status, "SCHEDULED");
      await startNextAuction(); // همان کاری که زمان‌بند پس از auction_gap_sec می‌کند
      const eAuction = await prisma.auction.findUniqueOrThrow({ where: { productId: E.product.id } });
      eq("شروع بعدی: حراج بعدیِ صف (تیم E) زنده شد", eAuction.status, "LIVE");
    }

    // ---------- پایان بازی: حراج زنده تسویه و صف باقی‌مانده پاک می‌شود ----------
    {
      const eAuction = await prisma.auction.findUniqueOrThrow({ where: { productId: E.product.id } });
      await placeBid(eAuction.id, free.id, eAuction.startPrice);
      const F = await mkTeamWithProduct("F", 10);
      const f1 = await mkUser("f1", F.team.id);
      const qF = await enqueueAuction(f1.id, "general");
      check("صف: تیم F پشت حراج زنده در صف است", qF.ok && qF.position === 2, qF);

      const tr = await transitionTo("CLOSED", null);
      check("transitionTo(CLOSED) بدون خطای تسویه", !tr.settleFailed, tr);
      const closedE = await prisma.auction.findUniqueOrThrow({ where: { id: eAuction.id } });
      eq("پایان بازی: حراج زنده تسویه شد و پیشتاز برنده شد", `${closedE.status}/${closedE.winnerId === free.id}/${closedE.finalPrice}`, `ENDED/true/${eAuction.startPrice}`);
      eq("پایان بازی: خرید برندهٔ حراج ثبت شد", await prisma.purchase.count({ where: { productId: E.product.id, userId: free.id } }), 1);
      eq("پایان بازی: حراج اجرانشدهٔ صف حذف شد", await prisma.auction.count({ where: { productId: F.product.id } }), 0);
      eq("پایان بازی: هیچ حراج LIVE یا SCHEDULED نماند", await prisma.auction.count({ where: { status: { in: ["LIVE", "SCHEDULED"] } } }), 0);
      check("پایان بازی: تسویهٔ نهایی هم انجام شد", (await getSettledAt()) !== null);
      const scoreE = await prisma.teamScore.findUniqueOrThrow({ where: { teamId_trackId: { teamId: E.team.id, trackId: "general" } } });
      check("پایان بازی: خرید حراج در حمایت مردمی تیم E حساب شد", scoreE.supporters === 1 && scoreE.coinsReceived === eAuction.startPrice, { supporters: scoreE.supporters, coins: scoreE.coinsReceived });
      const afterClose = await enqueueAuction(f1.id, "general");
      check("enqueueAuction: پس از پایان بازی رد می‌شود", !afterClose.ok, afterClose);
      eq("پس از پایان بازی startNextAuction کاری نمی‌کند", await startNextAuction(5), null);
    }
  } finally {
    try {
      const { prisma } = await import("../src/lib/db");
      await prisma.$disconnect();
    } catch {
      /* پاکسازی بهترین‌تلاش */
    }
    tempDb?.cleanup();
  }

  console.log("");
  console.log(`نتیجه: ${passed} PASS · ${failed} FAIL`);
  console.log(failed === 0 ? "SMOKE: PASS" : "SMOKE: FAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE: FAIL — خطای غیرمنتظره");
  console.error(e);
  tempDb?.cleanup();
  process.exit(1);
});
