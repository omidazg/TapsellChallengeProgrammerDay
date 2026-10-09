/**
 * دود-تست خرید سکه با پول (CoinOrder) و خرید جایگاه تبلیغاتی با قیمت ثابت.
 * اجرا: npx tsx scripts/smoke-coins.ts
 *
 * پوشش:
 *   ۱) درایور آزمایشی (fake): createCoinOrder → verifyCoinOrder(OK) → یک‌بار اعتبار به کیف، دفتر کل
 *      COIN_PURCHASE، رشد صندوق جایزه؛ تأیید تکراری/هم‌زمان idempotent؛ پرداخت لغوشده FAILED؛
 *      حداقل خرید، سقف خرید هر نفر (پرداخت‌شده + در انتظار)، لغو سفارش، بسته بودن در CLOSED؛
 *      درگاه آزمایشی در production بی‌اجازهٔ صریح فعال نمی‌شود.
 *   ۲) درایور دستی (manual): سفارش PENDING می‌ماند تا برگزارکننده با adminMarkOrderPaid تأییدش کند؛
 *      adminRejectOrder؛ تأیید دوباره خطا می‌دهد.
 *   ۳) جایگاه تبلیغاتی: خرید با قیمت ثابت، سقف هر تیم، شرط تیم/محصول/سکه/فاز، جایگاه گذشته،
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
  const { coinSales, getPrizePool } = await import("../src/lib/prize-pool");
  const { PRIZE_POOL_BASE_MILLION_TOMAN } = await import("../src/lib/prizes");
  const { ensureAdSlots, adSlotPrices, buyAdSlot, slotsGrid, currentAdWinners } = await import("../src/lib/adslots");

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
    await prisma.product.create({
      data: { teamId: team.id, name: `محصول ${key}`, price: 10, submittedAt: submitted ? new Date() : null },
    });
    return team;
  };

  try {
    await setPhase("BUILD", null);
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

    const poolBefore = await getPrizePool();
    eq("صندوق جایزه پیش از هر خرید = پایه", poolBefore.totalMillion, PRIZE_POOL_BASE_MILLION_TOMAN);

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

    // صندوق جایزه
    const sales1 = await coinSales();
    eq("coinSales: ۵۰ سکه = ۵۰٬۰۰۰ تومان از ۱ سفارش", `${sales1.coins}/${sales1.toman}/${sales1.orders}`, "50/50000/1");
    const pool1 = await getPrizePool();
    check("صندوق جایزه به‌اندازهٔ خرید سکه بزرگ شد", Math.abs(pool1.extraMillion - 0.05) < 1e-9 && pool1.totalMillion > poolBefore.totalMillion, pool1);

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
    check("در CLOSED خرید سکه بسته است", !closed.ok && closed.error.includes("تمام شده"), closed);
    await setPhase("BUILD", null);

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

    const poolBeforeManual = await coinSales();
    const mark = await adminMarkOrderPaid(m1.orderId, "رسید کارت‌به‌کارت ۱۲۳");
    check("adminMarkOrderPaid: موفق", mark.ok, mark);
    eq("adminMarkOrderPaid: کیف ۴۰ سکه بیشتر شد", await walletOf(manualUser.id), START + 40);
    const mo1Paid = await prisma.coinOrder.findUniqueOrThrow({ where: { id: m1.orderId } });
    check("adminMarkOrderPaid: PAID با یادداشت و refId دستی", mo1Paid.status === "PAID" && mo1Paid.note === "رسید کارت‌به‌کارت ۱۲۳" && !!mo1Paid.refId?.startsWith("MANUAL-"), mo1Paid);
    eq("adminMarkOrderPaid: دفتر کل COIN_PURCHASE", await prisma.ledgerEntry.count({ where: { refId: m1.orderId, reason: "COIN_PURCHASE", delta: 40 } }), 1);
    eq("adminMarkOrderPaid: صندوق جایزه ۴۰ هزار تومان بزرگ شد", (await coinSales()).toman - poolBeforeManual.toman, 40_000);
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
    // ۳) جایگاه تبلیغاتی با قیمت ثابت
    // =====================================================================
    const prices = await adSlotPrices();
    eq(
      "قیمت پیش‌فرض جایگاه‌ها (بنر/ویژه/اعلان)",
      `${prices.BANNER}/${prices.FEATURED}/${prices.PUSH}`,
      `${DEFAULTS.adslotPriceBanner}/${DEFAULTS.adslotPriceFeatured}/${DEFAULTS.adslotPricePush}`
    );

    const base = new Date(Date.now() + 2 * HOUR_MS);
    base.setMinutes(0, 0, 0);
    await ensureAdSlots(base, 4);
    await ensureAdSlots(base, 4); // idempotent
    eq("ensureAdSlots: ۴ ساعت × ۳ نوع = ۱۲ جایگاه (idempotent)", await prisma.adSlot.count(), 12);
    const pastStart = new Date(Date.now() - 3 * HOUR_MS);
    pastStart.setMinutes(0, 0, 0);
    await ensureAdSlots(pastStart, 1);
    const slotOf = async (kind: string, start: Date, h = 0) =>
      prisma.adSlot.findUniqueOrThrow({ where: { kind_hourStart: { kind, hourStart: new Date(start.getTime() + h * HOUR_MS) } } });

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
    const buy1 = await buyAdSlot(p1.id, banner0.id);
    check("buyAdSlot: خرید بنر با قیمت ثابت", buy1.ok && buy1.price === prices.BANNER, buy1);
    eq("buyAdSlot: کیف خریدار به‌اندازهٔ قیمت کم شد", await walletOf(p1.id), START - prices.BANNER);
    const soldBanner = await prisma.adSlot.findUniqueOrThrow({ where: { id: banner0.id } });
    eq("buyAdSlot: جایگاه CLOSED به نام تیم با قیمت پرداختی", `${soldBanner.status}/${soldBanner.winnerTeamId === P.id}/${soldBanner.pricePaid}`, `CLOSED/true/${prices.BANNER}`);
    const adLedger = await prisma.ledgerEntry.findMany({ where: { refId: banner0.id, reason: "ADSLOT" } });
    eq("buyAdSlot: دفتر کل BUY/−قیمت/تیم", adLedger.map((l) => `${l.wallet}/${l.delta}/${l.teamId === P.id}`).join(","), `BUY/${-prices.BANNER}/true`);

    const taken = await buyAdSlot(q1.id, banner0.id);
    check("جایگاه فروخته‌شده دوباره قابل خرید نیست", !taken.ok && taken.error.includes("فروخته"), taken);
    eq("خرید ناموفق: کیف دست نخورد", await walletOf(q1.id), START);

    const feat0 = await slotOf("FEATURED", base, 0);
    const buy2 = await buyAdSlot(p2.id, feat0.id);
    check("عضو دیگر تیم هم می‌تواند از کیف خودش برای تیم بخرد", buy2.ok && buy2.price === prices.FEATURED, buy2);
    const quota = await buyAdSlot(p1.id, (await slotOf("PUSH", base, 0)).id);
    check(`سقف هر تیم (${DEFAULTS.adslotMaxPerTeam} جایگاه) رعایت می‌شود`, !quota.ok && quota.error.includes("حداکثر"), quota);
    eq("رد سقف: کیف دست نخورد", await walletOf(p1.id), START - prices.BANNER);

    const noProduct = await buyAdSlot(r1.id, (await slotOf("PUSH", base, 0)).id);
    check("تیم بدون محصول ثبت‌شده رد می‌شود", !noProduct.ok && noProduct.error.includes("ثبت نهایی"), noProduct);
    const noTeam = await buyAdSlot(z1.id, (await slotOf("PUSH", base, 0)).id);
    check("کاربر بی‌تیم رد می‌شود", !noTeam.ok && noTeam.error.includes("عضو یک تیم"), noTeam);
    const poor = await buyAdSlot(s1.id, (await slotOf("FEATURED", base, 1)).id);
    check("سکهٔ ناکافی رد می‌شود", !poor.ok && poor.error.includes("سکهٔ کافی"), poor);
    const past = await buyAdSlot(q1.id, (await slotOf("BANNER", pastStart, 0)).id);
    check("جایگاه گذشته قابل خرید نیست", !past.ok && past.error.includes("گذشته"), past);
    check("جایگاه ناموجود رد می‌شود", !(await buyAdSlot(q1.id, "no-such-slot")).ok);

    // قیمت از تنظیمات برگزارکننده
    await setSetting("adslot_price_push", "5");
    const cheap = await buyAdSlot(s1.id, (await slotOf("PUSH", base, 1)).id);
    check("قیمت از تنظیم adslot_price_push خوانده می‌شود", cheap.ok && cheap.price === 5, cheap);
    eq("کیف کم‌موجودی ۵ سکه کم شد", await walletOf(s1.id), 25);
    await prisma.setting.delete({ where: { key: "adslot_price_push" } });

    // قفل فاز
    for (const phase of ["SEED_ROUND", "CLOSED"] as const) {
      await setPhase(phase, null);
      const r = await buyAdSlot(q1.id, (await slotOf("FEATURED", base, 1)).id);
      check(`buyAdSlot در فاز ${phase} رد می‌شود`, !r.ok && r.error.includes("روز بازار"), r);
    }
    await setPhase("MARKET", null);
    const inMarket = await buyAdSlot(q1.id, (await slotOf("FEATURED", base, 1)).id);
    check("buyAdSlot در روز بازار هم مجاز است", inMarket.ok, inMarket);

    // شبکهٔ جایگاه‌ها و برندگان فعلی
    const grid = await slotsGrid(P.id);
    const cell = grid.find((c) => c.id === banner0.id);
    check("slotsGrid: جایگاه خریده‌شده SOLD و mine=true با نام تیم", cell?.state === "SOLD" && cell.mine && cell.winnerTeamName === "تیم P", cell);
    check("slotsGrid: جایگاه‌های گذشته PAST", grid.filter((c) => c.hourStart === pastStart.toISOString()).every((c) => c.state === "PAST"));
    check("slotsGrid: جایگاه آزاد OPEN با قیمت", grid.some((c) => c.state === "OPEN" && c.kind === "BANNER" && c.price === prices.BANNER));
    const winners = await currentAdWinners(new Date(base.getTime() + 30 * 60_000));
    check("currentAdWinners: در ساعت اول بنر و کارت ویژه مال تیم P است", winners.banner === P.id && winners.featured === P.id && winners.push === null, winners);
    const nowWinners = await currentAdWinners(new Date());
    check("currentAdWinners: پیش از شروع ساعت، برنده‌ای نیست", !nowWinners.banner && !nowWinners.featured, nowWinners);

    // مسابقه: دو تیم هم‌زمان یک جایگاه را می‌خرند
    for (const [round, kind] of [[1, "BANNER"], [2, "FEATURED"]] as const) {
      const T1 = await mkTeam(`race${round}a`);
      const T2 = await mkTeam(`race${round}b`);
      const u1 = await mkUser(`race${round}a`, T1.id);
      const u2 = await mkUser(`race${round}b`, T2.id);
      const slot = await slotOf(kind, base, 2);
      const results = await Promise.all([buyAdSlot(u1.id, slot.id), buyAdSlot(u2.id, slot.id)]);
      const wins = results.filter((r) => r.ok).length;
      eq(`مسابقهٔ ${round}: دقیقاً یک خرید موفق`, wins, 1);
      const losers = results.filter((r) => !r.ok) as { ok: false; error: string }[];
      check(`مسابقهٔ ${round}: بازنده پیام «فروخته» می‌گیرد`, losers.length === 1 && losers[0].error.includes("فروخته"), losers);
      const charged = [START - (await walletOf(u1.id)), START - (await walletOf(u2.id))].filter((d) => d !== 0);
      eq(`مسابقهٔ ${round}: فقط یک کیف بدهکار شد`, charged.join(","), String(prices[kind]));
      eq(`مسابقهٔ ${round}: یک ردیف دفتر کل`, await prisma.ledgerEntry.count({ where: { refId: slot.id, reason: "ADSLOT" } }), 1);
      const s = await prisma.adSlot.findUniqueOrThrow({ where: { id: slot.id } });
      const winnerTeam = results[0].ok ? T1.id : T2.id;
      eq(`مسابقهٔ ${round}: جایگاه به نام تیم برنده`, s.winnerTeamId, winnerTeam);
    }

    // مسابقهٔ سقف: دو عضو یک تیم هم‌زمان دو جایگاه مختلف می‌خرند ولی سقف تیم ۱ است
    {
      await setSetting("adslot_max_per_team", "1");
      const U = await mkTeam("quota-race");
      const ua = await mkUser("qa", U.id);
      const ub = await mkUser("qb", U.id);
      const [ra, rb] = await Promise.all([
        buyAdSlot(ua.id, (await slotOf("BANNER", base, 3)).id),
        buyAdSlot(ub.id, (await slotOf("FEATURED", base, 3)).id),
      ]);
      eq("مسابقهٔ سقف تیم: فقط یکی از دو خرید هم‌زمان موفق شد", [ra, rb].filter((r) => r.ok).length, 1);
      eq("مسابقهٔ سقف تیم: تیم فقط یک جایگاه دارد", await prisma.adSlot.count({ where: { winnerTeamId: U.id } }), 1);
      await prisma.setting.delete({ where: { key: "adslot_max_per_team" } });
    }

    // سازگاری کلی: هر جایگاه فروخته‌شده دقیقاً یک ردیف دفتر کل دارد
    const soldSlots = await prisma.adSlot.findMany({ where: { winnerTeamId: { not: null } } });
    const ledgerRows = await prisma.ledgerEntry.findMany({ where: { reason: "ADSLOT" } });
    check(
      "هر جایگاه فروخته‌شده دقیقاً یک ردیف دفتر کل با همان مبلغ دارد",
      soldSlots.every((s) => ledgerRows.filter((l) => l.refId === s.id && l.delta === -(s.pricePaid ?? 0)).length === 1) &&
        ledgerRows.length === soldSlots.length,
      { sold: soldSlots.length, ledger: ledgerRows.length }
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
