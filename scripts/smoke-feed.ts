/**
 * دود-تست فید زندهٔ رویدادها (item 47) و نمای سالن (item 44).
 * اجرا: npx tsx scripts/smoke-feed.ts
 *
 * روی یک پایگاه‌دادهٔ SQLite موقت: یک تیم، یک ایدهٔ ثبت‌شده، یک سرمایه‌گذاری،
 * یک خرید، یک حراج‌بردهٔ و یک تغییر فاز می‌سازد؛ سپس buildFeed و
 * getHallPayloadCached را می‌آزماید: ترتیب نزولی زمان، متن‌های فارسی مورد
 * انتظار، شکل payload سالن، و نشت‌نداشتن ایمیل/موجودی کیف پول در خروجی JSON.
 */

import { createTempDb, isTempDatabaseUrl } from "./lib/temp-db";
import type { Phase } from "../src/lib/phases";

const ownTempDb = isTempDatabaseUrl(process.env.DATABASE_URL) ? null : createTempDb("feed");

const TAG = `smokefeed_${Date.now()}`;

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

/** جست‌وجوی رشتهٔ ایمیل‌مانند (وجود @) در هر رشتهٔ متنی JSON. */
function containsEmailLike(value: unknown): boolean {
  if (typeof value === "string") return value.includes("@");
  if (Array.isArray(value)) return value.some(containsEmailLike);
  if (value && typeof value === "object") return Object.values(value).some(containsEmailLike);
  return false;
}

/** جست‌وجوی کلیدهای مربوط به موجودی کیف پول در هر سطح از یک شیٔ JSON. */
const WALLET_KEY_PATTERN = /wallet|seedWallet|buyWallet|treasury/i;
function containsWalletKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsWalletKey);
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (WALLET_KEY_PATTERN.test(k)) return true;
      if (containsWalletKey(v)) return true;
    }
  }
  return false;
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { buildFeed } = await import("../src/lib/feed");
  const { getHallPayloadCached } = await import("../src/lib/hall");
  const { setPhase } = await import("../src/lib/phase");
  const { invalidate } = await import("../src/lib/ttl-cache");

  const createdTeamIds: string[] = [];
  const createdUserIds: string[] = [];
  const previousPhase = (await prisma.setting.findUnique({ where: { key: "phase" } }))?.value ?? null;

  try {
    // ---------- ساخت داده ----------
    const teamA = await prisma.team.create({ data: { name: `${TAG}_تیم_آلفا`, slug: `${TAG}-alpha` } });
    const teamB = await prisma.team.create({ data: { name: `${TAG}_تیم_بتا`, slug: `${TAG}-beta` } });
    createdTeamIds.push(teamA.id, teamB.id);

    const userA = await prisma.user.create({
      data: {
        email: `${TAG}_a@example.test`,
        passwordHash: "x",
        nickname: `${TAG}_نیک_آلفا`,
        role: "DEALMAKER",
        power: "HYPE",
        teamId: teamA.id,
        seedWallet: 123,
        buyWallet: 456,
      },
    });
    const userB = await prisma.user.create({
      data: {
        email: `${TAG}_b@example.test`,
        passwordHash: "x",
        nickname: `${TAG}_نیک_بتا`,
        role: "BUILDER",
        power: "BARGAIN",
        teamId: teamB.id,
        seedWallet: 789,
        buyWallet: 101,
      },
    });
    createdUserIds.push(userA.id, userB.id);

    const ideaA = await prisma.idea.create({
      data: {
        teamId: teamA.id,
        title: "ایدهٔ آلفا",
        oneLiner: "یک‌خطی",
        problem: "مسئله",
        audience: "مخاطب",
        buildPlan: "برنامه",
        fundingCap: 200,
        revenueShare: 30,
        submittedAt: new Date(Date.now() - 5 * 60_000),
      },
    });

    const investment = await prisma.investment.create({
      data: { ideaId: ideaA.id, userId: userB.id, amount: 999, selfFunded: false, createdAt: new Date(Date.now() - 4 * 60_000) },
    });

    const productA = await prisma.product.create({
      data: {
        teamId: teamA.id,
        name: "محصول آلفا",
        specialName: "نسخهٔ ویژهٔ آلفا",
        price: 20,
        specialStart: 20,
        submittedAt: new Date(Date.now() - 3 * 60_000),
      },
    });

    const purchase = await prisma.purchase.create({
      data: { productId: productA.id, userId: userB.id, amount: 42, createdAt: new Date(Date.now() - 2 * 60_000) },
    });

    const auction = await prisma.auction.create({
      data: {
        productId: productA.id,
        order: 0,
        startPrice: 20,
        status: "ENDED",
        startsAt: new Date(Date.now() - 90_000),
        endsAt: new Date(Date.now() - 60_000),
        winnerId: userB.id,
        finalPrice: 77,
      },
    });

    await setPhase("MARKET", null);
    // خودِ setPhase چیزی در AuditLog ثبت نمی‌کند (این کار در src/app/admin/actions.ts با audit() انجام می‌شود)؛
    // برای شبیه‌سازی همان مسیر واقعی، ردیف AuditLog را همین‌جا با همان شکل («phase.set» + target=فاز جدید) می‌سازیم.
    await prisma.auditLog.create({ data: { actorId: null, action: "phase.set", target: "MARKET", detail: "" } });
    invalidate(""); // پس از setPhase، کش‌های دیگر (فید/سالن) هم باید تازه محاسبه شوند

    // ---------- فید ----------
    const feed = await buildFeed(20);
    check("فید حداقل ۶ رویداد دارد (تیم×۲ + ایده + سرمایه‌گذاری + خرید + حراج + فاز)", feed.length >= 7, `len=${feed.length}`);

    const ids = feed.map((e) => e.id);
    check("شناسه‌ها یکتا هستند", new Set(ids).size === ids.length);

    check(
      "ترتیب فید نزولی بر اساس زمان است",
      feed.every((e, i) => i === 0 || new Date(feed[i - 1].at).getTime() >= new Date(e.at).getTime()),
      feed.map((e) => e.at).join(" | ")
    );

    const teamEvent = feed.find((e) => e.id === `team:${teamA.id}`);
    check("متن رویداد «تیم ساخته شد» درست است", teamEvent?.text === `تیم «${teamA.name}» ساخته شد`, teamEvent?.text);

    const ideaEvent = feed.find((e) => e.id === `idea:${ideaA.id}`);
    check("متن رویداد «ایده ثبت شد» درست است", ideaEvent?.text === `تیم «${teamA.name}» ایده‌اش را ثبت کرد`, ideaEvent?.text);

    const investEvent = feed.find((e) => e.id === `invest:${investment.id}`);
    check(
      "متن رویداد سرمایه‌گذاری الگوی «سرمایهٔ تازه گرفت» را دارد و بدون مبلغ است",
      investEvent?.text === `تیم «${teamA.name}» سرمایهٔ تازه گرفت`,
      investEvent?.text
    );
    check("متن سرمایه‌گذاری مبلغ (۹۹۹) را لو نمی‌دهد", !!investEvent && !investEvent.text.includes("999"), investEvent?.text);

    const purchaseEvent = feed.find((e) => e.id === `purchase:${purchase.id}`);
    check(
      "متن رویداد خرید شامل خریدار/تیم/محصول است",
      purchaseEvent?.text === `${userB.nickname} از تیم «${teamA.name}» محصول «${productA.name}» را خرید`,
      purchaseEvent?.text
    );

    const auctionEvent = feed.find((e) => e.id === `auction:${auction.id}`);
    check(
      "متن رویداد برد حراج شامل نیک‌نیم برنده و اسم محصول است",
      auctionEvent?.text === `${userB.nickname} حراج «${productA.name}» را برد`,
      auctionEvent?.text
    );

    const phaseEvent = feed.find((e) => e.text.includes("فاز بازی به"));
    check("رویداد تغییر فاز ساخته شد", !!phaseEvent, JSON.stringify(feed.map((e) => e.text)));

    // ---------- بدون نشت ----------
    const feedJson = JSON.stringify(feed);
    check("فید هیچ ایمیلی ندارد", !feedJson.includes("@"));
    check("فید هیچ کلید موجودی کیف پولی ندارد", !containsWalletKey(feed));
    check("فید مبلغ سرمایه‌گذاری (۹۹۹) را لو نمی‌دهد", !feedJson.includes("999"));

    // ---------- payload سالن ----------
    const hall = await getHallPayloadCached();
    check("payload سالن فاز/برچسب/سرور-ناو دارد", typeof hall.phase === "string" && typeof hall.phaseLabel === "string" && typeof hall.serverNow === "string");
    check("payload سالن فهرست تیم‌های برتر دارد", Array.isArray(hall.topTeams) && hall.topTeams.length > 0, `len=${hall.topTeams.length}`);
    check("هر تیم برتر فقط teamId/name/logoSeed/metric دارد", hall.topTeams.every((t) => {
      const keys = Object.keys(t).sort().join(",");
      return keys === "logoSeed,metric,name,teamId";
    }), JSON.stringify(hall.topTeams[0]));
    check("payload سالن نوار فروش (ticker) دارد", Array.isArray(hall.ticker.recent) && typeof hall.ticker.volume === "number");
    check("payload سالن فید دارد", Array.isArray(hall.feed) && hall.feed.length > 0, `len=${hall.feed.length}`);
    check(
      "auction سالن (اگر موجود) فیلدهای عمومی محصول/تیم/قیمت/زمان را دارد و نه بیشتر",
      hall.auction === null || typeof hall.auction.currentPrice === "number"
    );

    const hallJson = JSON.stringify(hall);
    check("payload سالن هیچ ایمیلی ندارد", !containsEmailLike(hall), hallJson.slice(0, 200));
    check("payload سالن هیچ کلید موجودی کیف پولی ندارد", !containsWalletKey(hall));

    // ---------- پاک‌سازی ----------
    await prisma.auction.deleteMany({ where: { id: auction.id } });
    await prisma.purchase.deleteMany({ where: { id: purchase.id } });
    await prisma.product.deleteMany({ where: { id: productA.id } });
    await prisma.investment.deleteMany({ where: { id: investment.id } });
    await prisma.idea.deleteMany({ where: { id: ideaA.id } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.team.deleteMany({ where: { id: { in: createdTeamIds } } });
    await prisma.auditLog.deleteMany({ where: { action: "phase.set" } });
    await setPhase((previousPhase as Phase | null) ?? "REGISTRATION", null);
  } catch (err) {
    console.error(err);
    check("اجرای بدون خطا", false, String(err));
  } finally {
    const { prisma: p } = await import("../src/lib/db");
    await p.$disconnect();
    ownTempDb?.cleanup();
  }

  console.log("");
  console.log(`نتیجه: ${passed}/${passed + failed} — ${failed === 0 ? "PASS" : "FAIL"}`);
  if (failed > 0) process.exitCode = 1;
}

void main();
