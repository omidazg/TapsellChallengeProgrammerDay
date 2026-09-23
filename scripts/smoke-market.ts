/**
 * دود-تست منطق خرید بازار (چانه‌زنی و سقف قیمت/خرید).
 * اجرا: npx tsx scripts/smoke-market.ts
 *
 * purchaseAction/saveProductAction اکشن‌های سروری هستند و به cookies() نیاز دارند که بیرون از
 * یک درخواست واقعی کار نمی‌کند؛ پس مثل الگوی scripts/smoke-auction.ts، هستهٔ منطق را مستقیماً از
 * lib صدا می‌زنیم: purchaseProduct از src/lib/market.ts و effectiveMaxPrice/buildChecklist از
 * src/lib/product(-utils).ts.
 *
 * برای اینکه پایگاه دادهٔ اصلی دست‌نخورده بماند، یک پایگاه‌دادهٔ موقت جدا ساخته می‌شود.
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

async function main() {
  TMP_DB = createTempDb("smoke-market").file;

  const { prisma } = await import("../src/lib/db");
  const { setPhase } = await import("../src/lib/phase");
  const { DEFAULTS } = await import("../src/lib/constants");
  const { purchaseProduct, bargainDiscountFor, effectivePurchaseCap } = await import("../src/lib/market");
  const { effectiveMaxPrice } = await import("../src/lib/product");
  const { buildChecklist, readyToSubmit } = await import("../src/lib/product-utils");

  async function setMaxPerTarget(value: number) {
    await prisma.setting.upsert({
      where: { key: "max_per_target" },
      update: { value: String(value) },
      create: { key: "max_per_target", value: String(value) },
    });
  }

  try {
    // ---------- پاکسازی ----------
    await prisma.bid.deleteMany({});
    await prisma.auction.deleteMany({});
    await prisma.purchase.deleteMany({});
    await prisma.heart.deleteMany({});
    await prisma.ledgerEntry.deleteMany({});
    await prisma.investment.deleteMany({});
    await prisma.dueDiligenceMessage.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.idea.deleteMany({});
    await prisma.teamScore.deleteMany({});
    await prisma.teamInvite.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.team.deleteMany({});

    // ---------- چیدمان ----------
    const seller = await prisma.team.create({ data: { name: "تیم فروشنده", slug: "smoke-m-seller", treasury: 100 } });
    const buyerTeam = await prisma.team.create({ data: { name: "تیم خریدار", slug: "smoke-m-buyer", treasury: 100 } });

    await setMaxPerTarget(DEFAULTS.maxPerTarget); // ۴۰، مقدار پیش‌فرض
    await setPhase("MARKET", null);

    const product = await prisma.product.create({
      data: { teamId: seller.id, name: "محصول دود-بازار", price: 20, submittedAt: new Date() },
    });

    const normalBuyer = await prisma.user.create({
      data: { email: "smoke-m-normal@test.local", passwordHash: "x", nickname: "خریدار معمولی", role: "DEALMAKER", power: "HYPE", teamId: buyerTeam.id, buyWallet: 100 },
    });
    const bargainBuyer = await prisma.user.create({
      data: { email: "smoke-m-bargain@test.local", passwordHash: "x", nickname: "خریدار چانه‌زن", role: "DEALMAKER", power: "BARGAIN", teamId: buyerTeam.id, buyWallet: 100 },
    });
    const tightWalletBargainBuyer = await prisma.user.create({
      data: { email: "smoke-m-tight@test.local", passwordHash: "x", nickname: "خریدار کم‌کیف", role: "DEALMAKER", power: "BARGAIN", teamId: buyerTeam.id, buyWallet: 18 },
    });
    const ownTeamBuyer = await prisma.user.create({
      data: { email: "smoke-m-own@test.local", passwordHash: "x", nickname: "عضو تیم فروشنده", role: "BUILDER", power: "HYPE", teamId: seller.id, buyWallet: 100 },
    });

    const expectedDiscount = bargainDiscountFor(product.price, DEFAULTS.bargainDiscount); // ۲۰×۰٫۱۵=۳
    eq("bargainDiscountFor: تخفیف روی قیمت ۲۰ با نرخ ۰٫۱۵ برابر ۳ است", expectedDiscount, 3);

    // ---------- خرید معمولی (بدون چانه‌زنی) ----------
    const r1 = await purchaseProduct(normalBuyer.id, product.id);
    check("purchaseProduct: خرید معمولی موفق است", r1.ok, r1);
    if (r1.ok) {
      eq("خرید معمولی: discount صفر است", r1.discount, 0);
      eq("خرید معمولی: amount (سقف/فروش) برابر قیمت کامل است", r1.amount, product.price);
      eq("خرید معمولی: paid (کسرشده از کیف) برابر قیمت کامل است", r1.paid, product.price);
    }
    const purchase1 = await prisma.purchase.findFirst({ where: { userId: normalBuyer.id, productId: product.id } });
    eq("Purchase.amount خرید معمولی = قیمت کامل", purchase1?.amount, 20);
    eq("Purchase.discount خرید معمولی = صفر", purchase1?.discount, 0);
    const walletAfterNormal = await prisma.user.findUniqueOrThrow({ where: { id: normalBuyer.id } });
    eq("کیف خرید معمولی به‌اندازهٔ قیمت کامل کم شد", walletAfterNormal.buyWallet, 80);
    const ledger1 = await prisma.ledgerEntry.findFirst({ where: { userId: normalBuyer.id, reason: "PURCHASE" } });
    eq("LedgerEntry خرید معمولی: delta = -قیمت کامل", ledger1?.delta, -20);

    // ---------- تیم خودی رد می‌شود ----------
    const ownResult = await purchaseProduct(ownTeamBuyer.id, product.id);
    check("purchaseProduct: خرید از تیم خودی رد می‌شود", !ownResult.ok && ownResult.error.includes("تیم خودت"), ownResult);

    // ---------- چانه‌زنی: تخفیف همیشگی، نه یک‌بار مصرف ----------
    const b1 = await purchaseProduct(bargainBuyer.id, product.id);
    check("purchaseProduct: خرید اول چانه‌زن موفق است", b1.ok, b1);
    if (b1.ok) {
      eq("چانه‌زنی خرید اول: discount = ۳", b1.discount, 3);
      eq("چانه‌زنی خرید اول: amount (سقف/فروش) = قیمت کامل ۲۰", b1.amount, 20);
      eq("چانه‌زنی خرید اول: paid (کسرشده از کیف) = ۱۷", b1.paid, 17);
    }
    const bargainUserAfter1 = await prisma.user.findUniqueOrThrow({ where: { id: bargainBuyer.id } });
    eq("چانه‌زنی: powerUsed تنظیم نمی‌شود (دائمی برای کل فاز بازار است)", bargainUserAfter1.powerUsed, false);
    eq("چانه‌زنی: کیف خرید فقط به‌اندازهٔ paid کم شد", bargainUserAfter1.buyWallet, 83);

    // دومین خرید همان کاربر: تخفیف دوباره اعمال می‌شود (نه یک‌بار مصرف)
    const b2 = await purchaseProduct(bargainBuyer.id, product.id);
    check("purchaseProduct: خرید دوم چانه‌زن هم موفق و با همان تخفیف است", b2.ok && b2.discount === 3 && b2.paid === 17, b2);
    const bargainUserAfter2 = await prisma.user.findUniqueOrThrow({ where: { id: bargainBuyer.id } });
    eq("چانه‌زنی: powerUsed همچنان false است پس از دومین خرید", bargainUserAfter2.powerUsed, false);

    // فروشندهٔ محصول همیشه قیمت کامل را «می‌فروشد» (sold/netSales بر مبنای Purchase.amount محاسبه می‌شود)
    const soldAgg = await prisma.purchase.aggregate({ where: { productId: product.id }, _sum: { amount: true } });
    eq(
      "فروش کل محصول (Σ Purchase.amount) شامل قیمت کامل هر دو خرید چانه‌زنی است",
      soldAgg._sum.amount,
      20 /* normal */ + 20 /* bargain#1 full */ + 20 /* bargain#2 full */
    );

    // سومین خرید چانه‌زن: سقف خرید هر نفر (۴۰) با قیمت کامل پر شده (۲۰+۲۰=۴۰)، پس رد می‌شود.
    const b3 = await purchaseProduct(bargainBuyer.id, product.id);
    check("purchaseProduct: سقف خرید هر نفر با قیمت کامل حساب می‌شود و سومین خرید رد می‌شود", !b3.ok && b3.error.includes("سقف"), b3);

    // ---------- کفایت کیف بر مبنای مبلغ تخفیف‌خورده سنجیده می‌شود ----------
    // کیف = ۱۸: کمتر از قیمت کامل (۲۰) ولی بیشتر/برابر مبلغ واقعی پرداختی (۱۷) → باید موفق شود.
    const tight = await purchaseProduct(tightWalletBargainBuyer.id, product.id);
    check(
      "purchaseProduct: با کیف ۱۸ و تخفیف چانه‌زنی (پرداخت واقعی ۱۷)، خرید موفق می‌شود",
      tight.ok && tight.paid === 17,
      tight
    );
    const tightWalletAfter = await prisma.user.findUniqueOrThrow({ where: { id: tightWalletBargainBuyer.id } });
    eq("کیف کم‌موجودی پس از خرید چانه‌زنی صفر شد (۱۸−۱۷=۱)", tightWalletAfter.buyWallet, 1);

    // ---------- effectivePurchaseCap: سقف بر مبنای قیمت کامل، نه مبلغ تخفیف‌خورده ----------
    // سقف=۳۷ (از قیمت ۲۰ بیشتر است، پس effectivePurchaseCap همان ۳۷ می‌ماند). با تخفیف چانه‌زنی،
    // اگر سقف اشتباهاً بر مبنای مبلغ پرداختی (۱۷) حساب می‌شد، خرید دوم (۱۷+۱۷=۳۴≤۳۷) قبول می‌شد؛
    // چون بر مبنای قیمت کامل حساب می‌شود (۲۰+۲۰=۴۰>۳۷)، باید رد شود.
    {
      await setMaxPerTarget(37);
      eq("effectivePurchaseCap(۳۷, ۲۰) = ۳۷", effectivePurchaseCap(37, 20), 37);
      const capBuyer = await prisma.user.create({
        data: { email: "smoke-m-cap@test.local", passwordHash: "x", nickname: "خریدار سقف", role: "DEALMAKER", power: "BARGAIN", teamId: buyerTeam.id, buyWallet: 100 },
      });
      const c1 = await purchaseProduct(capBuyer.id, product.id);
      check("سقف با قیمت کامل: خرید اول (۲۰ از ۳۷) موفق است", c1.ok, c1);
      const c2 = await purchaseProduct(capBuyer.id, product.id);
      check(
        "سقف با قیمت کامل: خرید دوم رد می‌شود چون ۲۰+۲۰=۴۰ > ۳۷ (نه چون ۱۷+۱۷=۳۴ ≤ ۳۷)",
        !c2.ok && c2.error.includes("سقف"),
        c2
      );
      await setMaxPerTarget(DEFAULTS.maxPerTarget);
    }

    // ---------- رفع باگ «قیمت غیرقابل‌خرید»: محصول قدیمیِ گران‌تر از سقف هم حداقل یک‌بار قابل خرید است ----------
    {
      await setMaxPerTarget(30);
      const legacySeller = await prisma.team.create({ data: { name: "تیم فروشندهٔ قدیمی", slug: "smoke-m-legacy-seller", treasury: 100 } });
      const legacyProduct = await prisma.product.create({
        data: { teamId: legacySeller.id, name: "محصول قدیمی گران", price: 50, submittedAt: new Date() },
      });
      eq("effectivePurchaseCap(۳۰, ۵۰) = ۵۰ (حداقل یک واحد همیشه قابل خرید)", effectivePurchaseCap(30, 50), 50);
      const legacyBuyer = await prisma.user.create({
        data: { email: "smoke-m-legacy@test.local", passwordHash: "x", nickname: "خریدار قدیمی", role: "DEALMAKER", power: "HYPE", teamId: buyerTeam.id, buyWallet: 100 },
      });
      const legacyResult = await purchaseProduct(legacyBuyer.id, legacyProduct.id);
      check("محصول گران‌تر از سقف عمومی حداقل یک‌بار قابل خرید است", legacyResult.ok, legacyResult);
      const legacyResult2 = await purchaseProduct(legacyBuyer.id, legacyProduct.id);
      check("خرید دوم همان محصول گران، پس از رسیدن به سقف مؤثر، رد می‌شود", !legacyResult2.ok, legacyResult2);
      await setMaxPerTarget(DEFAULTS.maxPerTarget);
    }

    // ---------- خرید فقط در فاز «روز بازار» ممکن است ----------
    await setPhase("BUILD", null);
    const outOfPhase = await purchaseProduct(normalBuyer.id, product.id);
    check("purchaseProduct: بیرون از فاز MARKET رد می‌شود", !outOfPhase.ok && outOfPhase.error.includes("روز بازار"), outOfPhase);
    await setPhase("MARKET", null);

    // ---------- effectiveMaxPrice: سقف مؤثر قیمت در مرکز ساخت ----------
    await setMaxPerTarget(25);
    eq("effectiveMaxPrice: کمینهٔ DEFAULTS.maxPrice و max_per_target (۲۵) برگردانده می‌شود", await effectiveMaxPrice(), 25);
    await setMaxPerTarget(1000);
    eq("effectiveMaxPrice: هرگز از DEFAULTS.maxPrice بیشتر نمی‌شود", await effectiveMaxPrice(), DEFAULTS.maxPrice);
    await setMaxPerTarget(DEFAULTS.maxPerTarget);

    // ---------- buildChecklist/readyToSubmit: قاعدهٔ قیمت با سقف مؤثر ----------
    const checklistInput = {
      name: "محصول تست",
      tagline: "تگ",
      description: "توضیح",
      demoUrl: "https://example.com",
      teaserUrl: "https://example.com/t",
      images: JSON.stringify(["https://picsum.photos/seed/a/800/500", "https://picsum.photos/seed/b/800/500", "https://picsum.photos/seed/c/800/500"]),
      price: 30,
      specialName: "ویژه",
      submittedAt: null as Date | null,
    };
    const lowCapChecklist = buildChecklist(checklistInput, 25);
    const priceItemLow = lowCapChecklist.find((i) => i.key === "price");
    check("buildChecklist: قیمت ۳۰ با سقف مؤثر ۲۵ ناتمام است", priceItemLow?.done === false, priceItemLow);
    eq("readyToSubmit: با سقف مؤثر ۲۵ و قیمت ۳۰، آماده نیست", readyToSubmit(checklistInput, 25), false);

    const highCapChecklist = buildChecklist(checklistInput, 35);
    const priceItemHigh = highCapChecklist.find((i) => i.key === "price");
    check("buildChecklist: قیمت ۳۰ با سقف مؤثر ۳۵ تمام است", priceItemHigh?.done === true, priceItemHigh);
    eq("readyToSubmit: با سقف مؤثر ۳۵ و قیمت ۳۰، آماده است", readyToSubmit(checklistInput, 35), true);
  } finally {
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
