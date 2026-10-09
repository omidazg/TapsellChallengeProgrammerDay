/**
 * دود-تست منطق خرید بازار (قیمت کامل، بدون سقف خرید، رزرو حراج و فهرست بازار).
 * اجرا: npx tsx scripts/smoke-market.ts
 *
 * purchaseAction/saveProductAction اکشن‌های سروری هستند و به cookies() نیاز دارند که بیرون از
 * یک درخواست واقعی کار نمی‌کند؛ پس مثل الگوی scripts/smoke-auction.ts، هستهٔ منطق را مستقیماً از
 * lib صدا می‌زنیم: purchaseProduct/getMarketProducts از src/lib/market.ts و
 * effectiveMaxPrice/buildChecklist از src/lib/product(-utils).ts.
 *
 * برای اینکه پایگاه دادهٔ اصلی دست‌نخورده بماند، یک پایگاه‌دادهٔ موقت جدا ساخته می‌شود.
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

async function main() {
  tempDb = createTempDb("smoke-market");

  const { prisma } = await import("../src/lib/db");
  const { setPhase } = await import("../src/lib/phase");
  const { DEFAULTS } = await import("../src/lib/constants");
  const { purchaseProduct, getMarketProducts, spendableBuyCoins } = await import("../src/lib/market");
  const { effectiveMaxPrice } = await import("../src/lib/product");
  const { buildChecklist, readyToSubmit } = await import("../src/lib/product-utils");

  try {
    // ---------- چیدمان ----------
    const seller = await prisma.team.create({ data: { name: "تیم فروشنده", slug: "smoke-m-seller" } });
    const buyerTeam = await prisma.team.create({ data: { name: "تیم خریدار", slug: "smoke-m-buyer" } });
    await setPhase("MARKET", null);

    const product = await prisma.product.create({
      data: { teamId: seller.id, name: "محصول دود-بازار", price: 20, submittedAt: new Date(), liveStatus: "LIVE" },
    });
    const otherProduct = await prisma.product.create({
      data: { teamId: buyerTeam.id, name: "محصول تیم خریدار", price: 10, submittedAt: new Date() },
    });
    // محصول ثبت‌نشده در بازار نمی‌آید و قابل خرید نیست
    const draftTeam = await prisma.team.create({ data: { name: "تیم پیش‌نویس", slug: "smoke-m-draft" } });
    const draft = await prisma.product.create({ data: { teamId: draftTeam.id, name: "پیش‌نویس", price: 10 } });

    const mkUser = (key: string, teamId: string | null, buyWallet: number) =>
      prisma.user.create({
        data: {
          email: `smoke-m-${key}@test.local`,
          passwordHash: "x",
          nickname: `کاربر ${key}`,
          role: "DEALMAKER",
          power: "",
          teamId,
          seedWallet: 0,
          buyWallet,
        },
      });
    const buyer = await mkUser("buyer", buyerTeam.id, 100);
    const teamless = await mkUser("teamless", null, 30);
    const poor = await mkUser("poor", buyerTeam.id, 19);
    const ownTeamBuyer = await mkUser("own", seller.id, 100);

    // ---------- خرید به قیمت کامل ----------
    const r1 = await purchaseProduct(buyer.id, product.id);
    check("purchaseProduct: خرید موفق است", r1.ok, r1);
    if (r1.ok) eq("خرید: amount برابر قیمت کامل است", r1.amount, product.price);
    const purchase1 = await prisma.purchase.findFirst({ where: { userId: buyer.id, productId: product.id } });
    eq("Purchase.amount = قیمت کامل", purchase1?.amount, 20);
    eq("Purchase.discount = صفر (تخفیفی در کار نیست)", purchase1?.discount, 0);
    eq("کیف خریدار به‌اندازهٔ قیمت کامل کم شد", (await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).buyWallet, 80);
    const ledger1 = await prisma.ledgerEntry.findFirst({ where: { userId: buyer.id, reason: "PURCHASE" } });
    eq("LedgerEntry خرید: delta = -قیمت کامل", ledger1?.delta, -20);
    eq("LedgerEntry خرید: کیف BUY", ledger1?.wallet, "BUY");
    eq("LedgerEntry خرید: refId = شناسهٔ خرید", ledger1?.refId, purchase1?.id);

    // ---------- سقفی روی تعداد خرید نیست ----------
    let repeatOk = true;
    for (let i = 0; i < 3; i++) {
      const r = await purchaseProduct(buyer.id, product.id);
      if (!r.ok) repeatOk = false;
    }
    check("خرید تکراری از یک محصول مجاز است (سقف خرید حذف شده)", repeatOk);
    eq("پس از ۴ خرید کیف ۲۰ سکه دارد", (await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).buyWallet, 20);

    // ---------- کاربر بی‌تیم هم می‌تواند بخرد ----------
    const rt = await purchaseProduct(teamless.id, product.id);
    check("کاربر بی‌تیم می‌تواند بخرد", rt.ok, rt);

    // ---------- تیم خودی رد می‌شود ----------
    const ownResult = await purchaseProduct(ownTeamBuyer.id, product.id);
    check("خرید از تیم خودی رد می‌شود", !ownResult.ok && ownResult.error.includes("تیم خودت"), ownResult);
    eq("کیف عضو تیم فروشنده دست نخورد", (await prisma.user.findUniqueOrThrow({ where: { id: ownTeamBuyer.id } })).buyWallet, 100);

    // ---------- سکهٔ ناکافی ----------
    const poorResult = await purchaseProduct(poor.id, product.id);
    check("سکهٔ ناکافی رد می‌شود", !poorResult.ok && poorResult.error.includes("سکهٔ کافی"), poorResult);
    eq("کیف کم‌موجودی دست نخورد", (await prisma.user.findUniqueOrThrow({ where: { id: poor.id } })).buyWallet, 19);

    // ---------- محصول ثبت‌نشده ----------
    const draftResult = await purchaseProduct(buyer.id, draft.id);
    check("محصول ثبت‌نشده قابل خرید نیست", !draftResult.ok, draftResult);

    // ---------- سکه‌های رزروشده برای پیشتازی در حراج زنده خرج‌پذیر نیستند ----------
    {
      const bidder = await mkUser("bidder", buyerTeam.id, 30);
      const auction = await prisma.auction.create({
        data: { productId: otherProduct.id, status: "LIVE", startPrice: 5, startsAt: new Date(), endsAt: new Date(Date.now() + 60_000) },
      });
      // bidder از تیم خریدار است؛ پیشنهاد روی محصول تیم خودش در این تست فقط برای ساختن رزرو است
      // (اعتبارسنجی placeBid در smoke-auction آزموده می‌شود).
      await prisma.bid.create({ data: { auctionId: auction.id, userId: bidder.id, amount: 15 } });
      eq("spendableBuyCoins: ۳۰ − رزرو ۱۵ = ۱۵", await spendableBuyCoins(bidder.id, 30), 15);
      const reservedResult = await purchaseProduct(bidder.id, product.id);
      check("خرید ۲۰ سکه‌ای با ۱۵ سکهٔ خرج‌پذیر رد می‌شود", !reservedResult.ok && reservedResult.error.includes("سکهٔ کافی"), reservedResult);
      await prisma.bid.deleteMany({ where: { auctionId: auction.id } });
      await prisma.auction.delete({ where: { id: auction.id } });
      const freed = await purchaseProduct(bidder.id, product.id);
      check("پس از آزاد شدن رزرو همان خرید موفق است", freed.ok, freed);
    }

    // ---------- خرید فقط در فاز «روز بازار» ممکن است ----------
    for (const phase of ["BUILD", "CLOSED"] as const) {
      await setPhase(phase, null);
      const outOfPhase = await purchaseProduct(buyer.id, product.id);
      check(`purchaseProduct: در فاز ${phase} رد می‌شود`, !outOfPhase.ok && outOfPhase.error.includes("روز بازار"), outOfPhase);
    }
    await setPhase("MARKET", null);

    // ---------- getMarketProducts ----------
    {
      const anon = await getMarketProducts("all");
      check("فهرست بازار فقط محصولات ثبت‌شده را دارد", anon.length === 2 && !anon.some((c) => c.id === draft.id), anon.map((c) => c.name));
      check("بدون viewer هیچ کارتی bought نیست", anon.every((c) => c.bought === false));
      const card = anon.find((c) => c.id === product.id);
      eq("کارت محصول منتشرشده live=true دارد", card?.live, true);
      eq("کارت محصول منتشرنشده live=false دارد", anon.find((c) => c.id === otherProduct.id)?.live, false);
      eq("sold محصول = جمع خریدها (۴×۲۰ + ۲۰ + ۲۰)", card?.sold, 120);
      const top = await getMarketProducts("top");
      eq("مرتب‌سازی top: پرفروش‌ترین اول", top[0]?.id, product.id);
      const cheap = await getMarketProducts("cheap");
      eq("مرتب‌سازی cheap: ارزان‌ترین اول", cheap[0]?.id, otherProduct.id);

      const mine = await getMarketProducts("all", { userId: buyer.id });
      eq("با viewer: محصولی که خریده bought=true", mine.find((c) => c.id === product.id)?.bought, true);
      eq("با viewer: محصولی که نخریده bought=false", mine.find((c) => c.id === otherProduct.id)?.bought, false);
      const notMine = await getMarketProducts("all", { userId: poor.id });
      check("viewer بدون خرید: هیچ کارتی bought نیست", notMine.every((c) => !c.bought));
    }

    // ---------- effectiveMaxPrice: سقف قیمت در مرکز ساخت ----------
    eq("effectiveMaxPrice = DEFAULTS.maxPrice", await effectiveMaxPrice(), DEFAULTS.maxPrice);

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
    eq("readyToSubmit با سقف پیش‌فرض (۴۰) و قیمت ۳۰، آماده است", readyToSubmit(checklistInput), true);
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
