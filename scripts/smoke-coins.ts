/**
 * دود-تست خرید سکه با پول (CoinOrder) و حراج جایگاه تبلیغاتی.
 * اجرا: npx tsx scripts/smoke-coins.ts
 *
 * پوشش:
 *   ۱) درایور آزمایشی (fake): createCoinOrder → verifyCoinOrder(OK) → یک‌بار اعتبار به کیف، دفتر کل
 *      COIN_PURCHASE؛ تأیید تکراری/هم‌زمان idempotent؛ پرداخت لغوشده FAILED؛
 *      حداقل خرید، سقف خرید هر نفر (پرداخت‌شده + در انتظار)، لغو سفارش، بسته بودن در CLOSED؛
 *      درگاه آزمایشی در production بی‌اجازهٔ صریح فعال نمی‌شود.
 *   ۲) درایور دستی (manual): سفارش PENDING می‌ماند تا برگزارکننده با adminMarkOrderPaid تأییدش کند؛
 *      adminRejectOrder؛ تأیید دوباره خطا می‌دهد.
 *   ۳) جایگاه تبلیغاتی: پیشنهاد و بازگشت سکهٔ نفر قبلی، سقف هر تیم، شرط تیم/محصول/سکه/فاز، جایگاه گذشته،
 *      و مسابقهٔ دو خرید هم‌زمان روی یک جایگاه (فقط یکی موفق و فقط یک کیف بدهکار).
 *
 * روی پایگاه‌دادهٔ موقت (createTempDb) اجرا می‌شود؛ dev.db لمس نمی‌شود. متغیرهای محیطی
 * PAYMENT_DRIVER/PAYMENT_FAKE_ALLOWED فقط داخل همین فرایند تنظیم می‌شوند (درایور هنگام هر فراخوانی خوانده می‌شود).
 */

import { createTempDb, isTempDatabaseUrl } from "./lib/temp-db";

// DATABASE_URL باید پیش از import شدن src/lib/db تنظیم شود.
const ownTempDb = isTempDatabaseUrl(process.env.DATABASE_URL) ? null : createTempDb("coins");

process.env.PAYMENT_DRIVER = "fake";
process.env.PAYMENT_FAKE_ALLOWED = "1";

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

const HOUR_MS = 60 * 60 * 1000;

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { setPhase } = await import("../src/lib/phase");
  const { DEFAULTS, COIN_PRICE_RIAL } = await import("../src/lib/constants");
  const {
    createCoinOrder,
    verifyCoinOrder,
    cancelCoinOrder,
    boughtOrPendingCoins,
    adminMarkOrderPaid,
    adminRejectOrder,
    getPaymentDriver,
    coinsToRial,
    coinsToToman,
  } = await import("../src/lib/coins");
  const { setModuleStatus } = await import("../src/lib/module-state");
  const { ensureAdSlots, adSlotPrices, bidAdSlot, slotsGrid, currentAdWinners, ADSLOT_REFUND_REASON } = await import("../src/lib/adslots");

  const setSetting = (key: string, value: string) =>
    prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  const walletOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).buyWallet;
  const env = process.env as Record<string, string | undefined>;

  let n = 0;
  const mkUser = (key: string, teamId: string | null, buyWallet = DEFAULTS.startingCoins) =>
    prisma.user.create({
      data: {
        email: `smoke-coins-${key}-${n++}@test.local`,
        passwordHash: "x",
        nickname: `کاربر ${key}`,
        role: "BUILDER",
        power: "",
        teamId,
        seedWallet: 0,
        buyWallet,
      },
    });
  const mkTeam = async (key: string, submitted = true) => {
    const team = await prisma.team.create({ data: { name: `تیم ${key}`, slug: `smoke-coins-${key}` } });
    const product = await prisma.product.create({
      data: { teamId: team.id, slug: `${team.slug}-general`, name: `محصول ${key}`, price: 10, submittedAt: submitted ? new Date() : null },
    });
    return { ...team, productId: product.id };
  };

  try {
    await setPhase("LIVE", null);
    const CALLBACK = "http://localhost:3000/";

    // =====================================================================
    // ۱) درایور آزمایشی
    // =====================================================================
    eq("PAYMENT_DRIVER=fake → درایور fake", getPaymentDriver().name, "fake");
    eq("coinsToRial: هر سکه ۱۰ هزار ریال", coinsToRial(3), 3 * COIN_PRICE_RIAL);
    eq("coinsToToman: هر سکه هزار تومان", coinsToToman(3), 3000);

    const buyer = await mkUser("buyer", null);
    const START = DEFAULTS.startingCoins;
    await setSetting("max_bought_coins_per_user", "100");

    // حداقل خرید
    const tooSmall = await createCoinOrder(buyer.id, DEFAULTS.minCoinPurchase - 1, CALLBACK);
    check(`کمتر از حداقل خرید (${DEFAULTS.minCoinPurchase}) رد می‌شود`, !tooSmall.ok && tooSmall.error.includes("حداقل"), tooSmall);
    const nan = await createCoinOrder(buyer.id, Number.NaN, CALLBACK);
    check("تعداد نامعتبر رد می‌شود", !nan.ok, nan);
    eq("سفارش نامعتبر ساخته نشد", await prisma.coinOrder.count(), 0);

    // سفارش معتبر
    const o1 = await createCoinOrder(buyer.id, 50, CALLBACK);
    check("سفارش ۵۰ سکه‌ای ساخته شد", o1.ok, o1);
    if (!o1.ok || o1.next.kind !== "redirect") throw new Error("سفارش آزمایشی باید به درگاه هدایت شود");
    const auth1 = o1.next.authority;
    check("authority با FAKE- شروع می‌شود و شناسهٔ سفارش را دارد", auth1.startsWith(`FAKE-${o1.orderId}-`), auth1);
    check("آدرس درگاه آزمایشی /coins/fake-gateway است", o1.next.url.startsWith("/coins/fake-gateway?authority=") && o1.next.url.includes(encodeURIComponent(auth1)), o1.next.url);
    const order1 = await prisma.coinOrder.findUniqueOrThrow({ where: { id: o1.orderId } });
    eq("سفارش: PENDING / fake / مبلغ ریالی", `${order1.status}/${order1.gateway}/${order1.amountRial}`, `PENDING/fake/${50 * COIN_PRICE_RIAL}`);
    eq("سفارش: authority ذخیره شد", order1.authority, auth1);
    eq("پیش از تأیید کیف دست نخورده", await walletOf(buyer.id), START);
    const bp1 = await boughtOrPendingCoins(buyer.id);
    eq("boughtOrPendingCoins: ۰ پرداخت‌شده / ۵۰ در انتظار", `${bp1.paid}/${bp1.pending}`, "0/50");

    // سقف: پرداخت‌شده + در انتظار
    const overCap = await createCoinOrder(buyer.id, 60, CALLBACK);
    check("سقف خرید هر نفر سفارش در انتظار را هم حساب می‌کند (۵۰ + ۶۰ > ۱۰۰)", !overCap.ok && overCap.error.includes("حداکثر"), overCap);

    // تأیید موفق
    const v1 = await verifyCoinOrder("fake", auth1, { status: "OK" });
    check("verifyCoinOrder(OK): موفق و alreadyPaid=false", v1.ok && !v1.alreadyPaid && v1.coins === 50 && v1.orderId === o1.orderId, v1);
    eq("کیف دقیقاً ۵۰ سکه بیشتر شد", await walletOf(buyer.id), START + 50);
    const paid1 = await prisma.coinOrder.findUniqueOrThrow({ where: { id: o1.orderId } });
    check("سفارش PAID با paidAt و refId", paid1.status === "PAID" && !!paid1.paidAt && !!paid1.refId?.startsWith("FAKE-"), paid1);
    const ledger1 = await prisma.ledgerEntry.findMany({ where: { refId: o1.orderId } });
    eq("دفتر کل: یک ردیف BUY/+۵۰/COIN_PURCHASE", ledger1.map((l) => `${l.wallet}/${l.delta}/${l.reason}`).join(","), "BUY/50/COIN_PURCHASE");
    eq("اعلان «سکه‌هایت اضافه شد» برای کاربر ثبت شد", await prisma.notification.count({ where: { userId: buyer.id, kind: "coins" } }), 1);

    // تأیید تکراری
    const v1b = await verifyCoinOrder("fake", auth1, { status: "OK" });
    check("تأیید تکراری: ok و alreadyPaid=true", v1b.ok && v1b.alreadyPaid, v1b);
    eq("تأیید تکراری: کیف دوباره شارژ نشد", await walletOf(buyer.id), START + 50);
    eq("تأیید تکراری: دفتر کل تکرار نشد", await prisma.ledgerEntry.count({ where: { refId: o1.orderId } }), 1);

    // پرداخت لغوشده در درگاه
    const o2 = await createCoinOrder(buyer.id, 30, CALLBACK);
    if (!o2.ok || o2.next.kind !== "redirect") throw new Error("سفارش دوم ساخته نشد");
    const v2 = await verifyCoinOrder("fake", o2.next.authority, { status: "NOK" });
    check("verifyCoinOrder(NOK): ناموفق", !v2.ok, v2);
    eq("سفارش لغوشده FAILED شد", (await prisma.coinOrder.findUniqueOrThrow({ where: { id: o2.orderId } })).status, "FAILED");
    eq("پرداخت ناموفق: کیف تغییر نکرد", await walletOf(buyer.id), START + 50);
    const v2b = await verifyCoinOrder("fake", o2.next.authority, { status: "OK" });
    check("سفارش FAILED دیگر با بازگشت از درگاه پرداخت نمی‌شود", !v2b.ok && v2b.error.includes("قابل پرداخت نیست"), v2b);
    eq("سفارش FAILED در سقف حساب نمی‌شود", JSON.stringify(await boughtOrPendingCoins(buyer.id)), JSON.stringify({ paid: 50, pending: 0 }));

    // پر کردن سقف با سفارش در انتظار و لغو آن
    const o3 = await createCoinOrder(buyer.id, 50, CALLBACK);
    check("سفارش تا سقف (۵۰ + ۵۰ = ۱۰۰) پذیرفته شد", o3.ok, o3);
    const full = await createCoinOrder(buyer.id, DEFAULTS.minCoinPurchase, CALLBACK);
    check("در سقف: پیام «سفارش‌های در انتظار را تکمیل یا لغو کن»", !full.ok && full.error.includes("در انتظار"), full);
    const other = await mkUser("other", null);
    if (o3.ok) {
      eq("cancelCoinOrder: کاربر دیگر نمی‌تواند لغو کند", await cancelCoinOrder(other.id, o3.orderId), false);
      eq("cancelCoinOrder: صاحب سفارش لغو کرد", await cancelCoinOrder(buyer.id, o3.orderId), true);
      eq("cancelCoinOrder: لغو دوباره false", await cancelCoinOrder(buyer.id, o3.orderId), false);
      eq("سفارش لغوشده CANCELED است", (await prisma.coinOrder.findUniqueOrThrow({ where: { id: o3.orderId } })).status, "CANCELED");
    }
    const afterCancel = await createCoinOrder(buyer.id, 20, CALLBACK);
    check("پس از لغو، جای سقف آزاد شد", afterCancel.ok, afterCancel);

    // تأیید هم‌زمان: فقط یک‌بار اعتبار
    if (afterCancel.ok && afterCancel.next.kind === "redirect") {
      const before = await walletOf(buyer.id);
      const auth = afterCancel.next.authority;
      const [c1, c2, c3] = await Promise.all([
        verifyCoinOrder("fake", auth, { status: "OK" }),
        verifyCoinOrder("fake", auth, { status: "OK" }),
        verifyCoinOrder("fake", auth, { status: "OK" }),
      ]);
      const fresh = [c1, c2, c3].filter((r) => r.ok && !r.alreadyPaid).length;
      eq("سه تأیید هم‌زمان: دقیقاً یکی اعتبار داد", fresh, 1);
      eq("سه تأیید هم‌زمان: کیف فقط ۲۰ سکه بیشتر شد", await walletOf(buyer.id), before + 20);
      eq("سه تأیید هم‌زمان: یک ردیف دفتر کل", await prisma.ledgerEntry.count({ where: { refId: afterCancel.orderId } }), 1);
    }

    // ورودی‌های نامعتبر بازگشت از درگاه
    check("درگاه ناشناخته رد می‌شود", !(await verifyCoinOrder("zarinpal", auth1, { status: "OK" })).ok);
    check("authority خالی رد می‌شود", !(await verifyCoinOrder("fake", "", { status: "OK" })).ok);
    const unknown = await verifyCoinOrder("fake", "FAKE-nope", { status: "OK" });
    check("authority ناشناخته: «سفارش پیدا نشد»", !unknown.ok && unknown.error.includes("پیدا نشد"), unknown);

    // پس از پایان بازی خرید سکه بسته است
    await setPhase("CLOSED", null);
    const closed = await createCoinOrder(other.id, 20, CALLBACK);
    check("در CLOSED خرید سکه بسته است", !closed.ok && closed.error.includes("فعلاً باز نیست"), closed);
    await setPhase("LIVE", null);

    // درگاه آزمایشی در production بی‌اجازهٔ صریح فعال نمی‌شود
    {
      const prevNodeEnv = env.NODE_ENV;
      env.NODE_ENV = "production";
      delete env.PAYMENT_FAKE_ALLOWED;
      eq("production + PAYMENT_DRIVER=fake بدون اجازه → manual", getPaymentDriver().name, "manual");
      const prodVerify = await verifyCoinOrder("fake", auth1, { status: "OK" });
      check("production: بازگشت از درگاه آزمایشی پذیرفته نمی‌شود", !prodVerify.ok, prodVerify);
      env.PAYMENT_FAKE_ALLOWED = "1";
      eq("production + PAYMENT_FAKE_ALLOWED=1 → fake", getPaymentDriver().name, "fake");
      if (prevNodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = prevNodeEnv;
    }

    // =====================================================================
    // ۲) درایور دستی
    // =====================================================================
    env.PAYMENT_DRIVER = "manual";
    eq("PAYMENT_DRIVER=manual → درایور manual", getPaymentDriver().name, "manual");
    const manualUser = await mkUser("manual", null);
    const m1 = await createCoinOrder(manualUser.id, 40, CALLBACK);
    check("سفارش دستی ساخته شد و next.kind=manual", m1.ok && m1.next.kind === "manual", m1);
    if (!m1.ok) throw new Error("سفارش دستی ساخته نشد");
    const mo1 = await prisma.coinOrder.findUniqueOrThrow({ where: { id: m1.orderId } });
    eq("سفارش دستی: PENDING / manual / بدون authority", `${mo1.status}/${mo1.gateway}/${mo1.authority}`, "PENDING/manual/null");
    eq("سفارش دستی: پیش از تأیید کیف دست نخورده", await walletOf(manualUser.id), START);
    check("درایور دستی هیچ بازگشت درگاهی را تأیید نمی‌کند", !(await verifyCoinOrder("manual", "x", {})).ok);
    eq("سفارش دستی همچنان PENDING", (await prisma.coinOrder.findUniqueOrThrow({ where: { id: m1.orderId } })).status, "PENDING");

    const mark = await adminMarkOrderPaid(m1.orderId, "رسید کارت‌به‌کارت ۱۲۳");
    check("adminMarkOrderPaid: موفق", mark.ok, mark);
    eq("adminMarkOrderPaid: کیف ۴۰ سکه بیشتر شد", await walletOf(manualUser.id), START + 40);
    const mo1Paid = await prisma.coinOrder.findUniqueOrThrow({ where: { id: m1.orderId } });
    check("adminMarkOrderPaid: PAID با یادداشت و refId دستی", mo1Paid.status === "PAID" && mo1Paid.note === "رسید کارت‌به‌کارت ۱۲۳" && !!mo1Paid.refId?.startsWith("MANUAL-"), mo1Paid);
    eq("adminMarkOrderPaid: دفتر کل COIN_PURCHASE", await prisma.ledgerEntry.count({ where: { refId: m1.orderId, reason: "COIN_PURCHASE", delta: 40 } }), 1);
    const markAgain = await adminMarkOrderPaid(m1.orderId, "دوباره");
    check("adminMarkOrderPaid دوباره: خطای «قبلاً پرداخت‌شده»", !markAgain.ok && !!markAgain.error?.includes("قبلاً"), markAgain);
    eq("adminMarkOrderPaid دوباره: کیف تغییر نکرد", await walletOf(manualUser.id), START + 40);
    check("adminMarkOrderPaid: سفارش ناموجود خطا می‌دهد", !(await adminMarkOrderPaid("no-such-order", "")).ok);

    const m2 = await createCoinOrder(manualUser.id, 10, CALLBACK);
    if (!m2.ok) throw new Error("سفارش دستی دوم ساخته نشد");
    const rej = await adminRejectOrder(m2.orderId, "وجهی نرسید");
    check("adminRejectOrder: موفق", rej.ok, rej);
    const mo2 = await prisma.coinOrder.findUniqueOrThrow({ where: { id: m2.orderId } });
    eq("adminRejectOrder: FAILED با یادداشت", `${mo2.status}/${mo2.note}`, "FAILED/وجهی نرسید");
    eq("adminRejectOrder: کیف تغییر نکرد", await walletOf(manualUser.id), START + 40);
    eq("adminRejectOrder دوباره: ok=false (دیگر PENDING نیست)", (await adminRejectOrder(m2.orderId, "")).ok, false);
    const lateMark = await adminMarkOrderPaid(m2.orderId, "وجه دیرتر رسید");
    check("adminMarkOrderPaid روی سفارش ردشده (وجه دیر رسید): اعتبار می‌دهد", lateMark.ok, lateMark);
    eq("سفارش ردشده پس از تأیید دستی: کیف ۱۰ سکه بیشتر شد", await walletOf(manualUser.id), START + 50);
    env.PAYMENT_DRIVER = "fake";

    // =====================================================================
    // ۳) حراج جایگاه تبلیغاتی: بالاترین پیشنهاد می‌برد و سکهٔ نفر قبلی برمی‌گردد
    // =====================================================================
    const prices = await adSlotPrices();
    eq(
      "کمترین پیشنهاد پیش‌فرض جایگاه‌ها (بنر/ویژه/اعلان)",
      `${prices.BANNER}/${prices.FEATURED}/${prices.PUSH}`,
      `${DEFAULTS.adslotPriceBanner}/${DEFAULTS.adslotPriceFeatured}/${DEFAULTS.adslotPricePush}`
    );

    const SLOT_MS = DEFAULTS.adslotHours * HOUR_MS;
    const base = new Date(Date.now() + 2 * HOUR_MS);
    base.setMinutes(0, 0, 0);
    await setPhase("LIVE", new Date(base.getTime() + 4 * SLOT_MS));
    await ensureAdSlots(base);
    await ensureAdSlots(base); // idempotent
    eq("ensureAdSlots: ۴ بازه × ۳ نوع = ۱۲ جایگاه (idempotent)", await prisma.adSlot.count(), 12);
    await setPhase("LIVE", null);
    const pastStart = new Date(Date.now() - 2 * SLOT_MS);
    const liveStart = new Date(Date.now() - HOUR_MS);
    await prisma.adSlot.create({ data: { kind: "BANNER", hourStart: pastStart } });
    await prisma.adSlot.create({ data: { kind: "BANNER", hourStart: liveStart } });
    const slotOf = async (kind: string, start: Date, i = 0) =>
      prisma.adSlot.findUniqueOrThrow({ where: { kind_hourStart: { kind, hourStart: new Date(start.getTime() + i * SLOT_MS) } } });

    const P = await mkTeam("P");
    const Q = await mkTeam("Q");
    const R = await mkTeam("R", false); // محصول ثبت‌نشده
    const S = await mkTeam("S");
    const p1 = await mkUser("p1", P.id);
    const p2 = await mkUser("p2", P.id);
    const q1 = await mkUser("q1", Q.id);
    const r1 = await mkUser("r1", R.id);
    const s1 = await mkUser("s1", S.id, 30);
    const z1 = await mkUser("z1", null);

    const banner0 = await slotOf("BANNER", base, 0);
    const lowBid = await bidAdSlot(p1.id, banner0.id, P.productId, prices.BANNER - 1);
    check("پیشنهاد کمتر از کمترین مبلغ رد می‌شود", !lowBid.ok && lowBid.error.includes("کمترین پیشنهاد"), lowBid);

    const bid1 = await bidAdSlot(p1.id, banner0.id, P.productId, prices.BANNER);
    check("bidAdSlot: نخستین پیشنهاد پذیرفته شد", bid1.ok && bid1.amount === prices.BANNER, bid1);
    eq("bidAdSlot: کیف همان لحظه به‌اندازهٔ پیشنهاد کم شد", await walletOf(p1.id), START - prices.BANNER);
    const leading = await prisma.adSlot.findUniqueOrThrow({ where: { id: banner0.id } });
    eq(
      "bidAdSlot: جایگاه باز به نام تیم و محصول با مبلغ پیشنهاد",
      `${leading.status}/${leading.winnerTeamId === P.id}/${leading.winnerProductId === P.productId}/${leading.pricePaid}`,
      `OPEN/true/true/${prices.BANNER}`
    );
    const adLedger = await prisma.ledgerEntry.findMany({ where: { refId: banner0.id, reason: "ADSLOT" } });
    eq("bidAdSlot: دفتر کل BUY/−مبلغ/تیم", adLedger.map((l) => `${l.wallet}/${l.delta}/${l.teamId === P.id}`).join(","), `BUY/${-prices.BANNER}/true`);

    const sameBid = await bidAdSlot(q1.id, banner0.id, Q.productId, prices.BANNER);
    check("پیشنهاد هم‌مبلغ با بالاترین رد می‌شود", !sameBid.ok && sameBid.error.includes("کمترین پیشنهاد"), sameBid);
    eq("پیشنهاد ناموفق: کیف دست نخورد", await walletOf(q1.id), START);

    const outbid = prices.BANNER + DEFAULTS.adslotBidIncrement;
    const bid2 = await bidAdSlot(q1.id, banner0.id, Q.productId, outbid);
    check("پیشنهاد بالاتر پذیرفته شد", bid2.ok && bid2.amount === outbid, bid2);
    eq("پیشنهاددهندهٔ شکسته‌شده کامل سکه‌اش را پس گرفت", await walletOf(p1.id), START);
    eq("پیشنهاد بالاتر از کیف نفر تازه کم شد", await walletOf(q1.id), START - outbid);
    eq("بازپرداخت در دفتر کل ثبت شد", await prisma.ledgerEntry.count({ where: { refId: banner0.id, userId: p1.id, reason: ADSLOT_REFUND_REASON, delta: prices.BANNER } }), 1);
    eq("تیم قبلی اعلان شکسته‌شدن گرفت", await prisma.notification.count({ where: { userId: p1.id, kind: "adslot_outbid" } }), 1);
    eq("هر دو پیشنهاد در تاریخچه مانده‌اند", await prisma.adSlotBid.count({ where: { slotId: banner0.id } }), 2);

    const feat0 = await slotOf("FEATURED", base, 0);
    const bid3 = await bidAdSlot(p2.id, feat0.id, P.productId, prices.FEATURED);
    check("عضو دیگر تیم هم می‌تواند از کیف خودش برای تیم پیشنهاد بدهد", bid3.ok, bid3);
    const push0 = await slotOf("PUSH", base, 0);
    const bid4 = await bidAdSlot(p1.id, push0.id, P.productId, prices.PUSH);
    check("سقف تیم فقط پیشتازی‌ها را می‌شمرد؛ جایگاه شکسته‌شده آزاد شده است", bid4.ok, bid4);
    const banner1 = await slotOf("BANNER", base, 1);
    const quota = await bidAdSlot(p1.id, banner1.id, P.productId, prices.BANNER);
    check(`سقف هر تیم (${DEFAULTS.adslotMaxPerTeam} جایگاه) رعایت می‌شود`, !quota.ok && quota.error.includes("حداکثر"), quota);
    eq("رد سقف: کیف دست نخورد", await walletOf(p1.id), START - prices.PUSH);

    const noProduct = await bidAdSlot(r1.id, banner1.id, R.productId, prices.BANNER);
    check("محصول ثبت‌نهایی‌نشده رد می‌شود", !noProduct.ok && noProduct.error.includes("ثبت نهایی"), noProduct);
    const foreign = await bidAdSlot(r1.id, banner1.id, Q.productId, prices.BANNER);
    check("محصول تیم دیگر رد می‌شود", !foreign.ok && foreign.error.includes("متعلق"), foreign);
    const noTeam = await bidAdSlot(z1.id, banner1.id, Q.productId, prices.BANNER);
    check("کاربر بی‌تیم رد می‌شود", !noTeam.ok && noTeam.error.includes("عضو یک تیم"), noTeam);
    const poor = await bidAdSlot(s1.id, (await slotOf("FEATURED", base, 1)).id, S.productId, prices.FEATURED);
    check("سکهٔ ناکافی رد می‌شود", !poor.ok && poor.error.includes("سکهٔ کافی"), poor);
    for (const [label, start] of [["جاری", liveStart], ["گذشته", pastStart]] as const) {
      const late = await bidAdSlot(q1.id, (await slotOf("BANNER", start, 0)).id, Q.productId, 500);
      check(`پیشنهاد روی بازهٔ ${label} بسته است`, !late.ok && late.error.includes("بسته"), late);
    }
    check("جایگاه ناموجود رد می‌شود", !(await bidAdSlot(q1.id, "no-such-slot", Q.productId, 100)).ok);

    // کمترین پیشنهاد از تنظیمات برگزارکننده
    await setSetting("adslot_price_push", "5");
    const cheap = await bidAdSlot(s1.id, (await slotOf("PUSH", base, 1)).id, S.productId, 5);
    check("کمترین پیشنهاد از تنظیم adslot_price_push خوانده می‌شود", cheap.ok && cheap.amount === 5, cheap);
    eq("کیف کم‌موجودی ۵ سکه کم شد", await walletOf(s1.id), 25);
    await prisma.setting.delete({ where: { key: "adslot_price_push" } });

    // قفل بخش جایگاه و پایان مسابقه
    const feat1 = await slotOf("FEATURED", base, 1);
    for (const status of ["ro", "closed", "hidden"] as const) {
      await setModuleStatus("adslots", status);
      const r = await bidAdSlot(q1.id, feat1.id, Q.productId, prices.FEATURED);
      check(`bidAdSlot در وضعیت ${status} رد می‌شود`, !r.ok && r.error.includes("فعلاً باز نیست"), r);
    }
    await setModuleStatus("adslots", "open");
    await setPhase("CLOSED", null);
    const afterEnd = await bidAdSlot(q1.id, feat1.id, Q.productId, prices.FEATURED);
    check("bidAdSlot پس از پایان مسابقه رد می‌شود", !afterEnd.ok, afterEnd);
    await setPhase("LIVE", null);
    const inMarket = await bidAdSlot(q1.id, feat1.id, Q.productId, prices.FEATURED);
    check("bidAdSlot وقتی بخش باز است مجاز است", inMarket.ok, inMarket);

    // شبکهٔ جایگاه‌ها و برندگان فعلی
    const grid = await slotsGrid(Q.id);
    const cell = grid.find((c) => c.id === banner0.id);
    check(
      "slotsGrid: جایگاه پیش‌بینی‌شده OPEN، mine=true، با کمترین پیشنهاد بعدی",
      cell?.state === "OPEN" && cell.mine && cell.winnerTeamName === "تیم Q" && cell.minBid === outbid + DEFAULTS.adslotBidIncrement,
      cell
    );
    check("slotsGrid: جایگاه گذشته PAST و جاری LIVE", grid.find((c) => c.hourStart === pastStart.toISOString())?.state === "PAST" && grid.find((c) => c.hourStart === liveStart.toISOString())?.state === "LIVE");
    const winners = await currentAdWinners(new Date(base.getTime() + 30 * 60_000));
    check("currentAdWinners: در بازهٔ اول بنر مال Q و کارت ویژه مال P است", winners.banner === Q.productId && winners.featured === P.productId, winners);
    const nowWinners = await currentAdWinners(new Date());
    check("currentAdWinners: پیش از شروع بازه، برنده‌ای نیست", !nowWinners.banner && !nowWinners.featured, nowWinners);

    // مسابقه: دو تیم هم‌زمان روی یک جایگاه با یک مبلغ پیشنهاد می‌دهند
    for (const [round, kind] of [[1, "BANNER"], [2, "FEATURED"]] as const) {
      const T1 = await mkTeam(`race${round}a`);
      const T2 = await mkTeam(`race${round}b`);
      const u1 = await mkUser(`race${round}a`, T1.id);
      const u2 = await mkUser(`race${round}b`, T2.id);
      const slot = await slotOf(kind, base, 2);
      const results = await Promise.all([bidAdSlot(u1.id, slot.id, T1.productId, prices[kind]), bidAdSlot(u2.id, slot.id, T2.productId, prices[kind])]);
      eq(`مسابقهٔ ${round}: دقیقاً یک پیشنهاد موفق`, results.filter((r) => r.ok).length, 1);
      const charged = [START - (await walletOf(u1.id)), START - (await walletOf(u2.id))].filter((d) => d !== 0);
      eq(`مسابقهٔ ${round}: فقط یک کیف بدهکار شد`, charged.join(","), String(prices[kind]));
      eq(`مسابقهٔ ${round}: یک ردیف دفتر کل`, await prisma.ledgerEntry.count({ where: { refId: slot.id, reason: "ADSLOT" } }), 1);
      const s = await prisma.adSlot.findUniqueOrThrow({ where: { id: slot.id } });
      eq(`مسابقهٔ ${round}: جایگاه به نام تیم برنده`, s.winnerTeamId, results[0].ok ? T1.id : T2.id);
    }

    // مسابقهٔ سقف: دو عضو یک تیم هم‌زمان روی دو جایگاه مختلف پیشنهاد می‌دهند ولی سقف تیم ۱ است
    {
      await setSetting("adslot_max_per_team", "1");
      const U = await mkTeam("quota-race");
      const ua = await mkUser("qa", U.id);
      const ub = await mkUser("qb", U.id);
      const [ra, rb] = await Promise.all([
        bidAdSlot(ua.id, (await slotOf("BANNER", base, 3)).id, U.productId, prices.BANNER),
        bidAdSlot(ub.id, (await slotOf("FEATURED", base, 3)).id, U.productId, prices.FEATURED),
      ]);
      eq("مسابقهٔ سقف تیم: فقط یکی از دو پیشنهاد هم‌زمان موفق شد", [ra, rb].filter((r) => r.ok).length, 1);
      eq("مسابقهٔ سقف تیم: تیم فقط یک جایگاه دارد", await prisma.adSlot.count({ where: { winnerTeamId: U.id } }), 1);
      await prisma.setting.delete({ where: { key: "adslot_max_per_team" } });
    }

    // سازگاری کلی: کیف‌ها فقط به اندازهٔ پیشنهادهای برندهٔ فعلی کم شده‌اند
    const heldSlots = await prisma.adSlot.findMany({ where: { winnerTeamId: { not: null } } });
    const ledgerSum = await prisma.ledgerEntry.aggregate({ where: { reason: { in: ["ADSLOT", ADSLOT_REFUND_REASON] } }, _sum: { delta: true } });
    eq(
      "جمع دفتر کل جایگاه‌ها با جمع پیشنهادهای برندهٔ فعلی یکی است",
      -(ledgerSum._sum.delta ?? 0),
      heldSlots.reduce((a, s) => a + (s.pricePaid ?? 0), 0)
    );
  } finally {
    await prisma.$disconnect();
    ownTempDb?.cleanup();
  }

  console.log("");
  console.log(`نتیجه: ${passed} PASS · ${failed} FAIL`);
  console.log(failed === 0 ? "SMOKE: PASS" : "SMOKE: FAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE: FAIL — خطای غیرمنتظره");
  console.error(e);
  ownTempDb?.cleanup();
  process.exit(1);
});
