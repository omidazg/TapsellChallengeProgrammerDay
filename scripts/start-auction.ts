/**
 * شروع دستی حراج زنده برای تست محلی.
 *
 *   npx tsx scripts/start-auction.ts [مدت‌به‌ثانیه=300] [--set-market]
 *
 * حراج زنده فقط در «روز بازار» (MARKET) اجرا می‌شود (فاز جداگانهٔ AUCTION حذف شده). در جریان عادی
 * هر تیم با enqueueAuction محصولش را به صف می‌فرستد؛ این اسکریپت مثل ابزار برگزارکننده همهٔ
 * محصولات ثبت‌شدهٔ باقی‌مانده را با ensureAuctions به صف اضافه و بعد حراج بعدی صف را زنده می‌کند.
 * با --set-market اگر فاز MARKET نباشد، فاز را (با پایان ۲۴ ساعت بعد) MARKET می‌کند.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { getPhase, setPhase } from "../src/lib/phase";
import { ensureAuctions, startNextAuction, listAuctions } from "../src/lib/auction";

const args = process.argv.slice(2);
const SET_MARKET = args.includes("--set-market");
const durationArg = args.find((a) => /^\d+$/.test(a));
const duration = durationArg ? Number(durationArg) : 300;

(async () => {
  const { phase } = await getPhase();
  if (phase !== "MARKET") {
    if (!SET_MARKET) {
      console.error(`فاز فعلی ${phase} است؛ حراج زنده فقط در MARKET اجرا می‌شود.`);
      console.error("   npx tsx scripts/set-phase.ts MARKET   یا همین اسکریپت با --set-market");
      await prisma.$disconnect();
      process.exit(1);
    }
    await setPhase("MARKET", new Date(Date.now() + 24 * 3600 * 1000));
    console.log("phase=MARKET");
  }
  await ensureAuctions();
  const a = await startNextAuction(duration);
  console.log("started:", a ? a.id : null);
  console.log(JSON.stringify(await listAuctions(), null, 1).slice(0, 600));
  await prisma.$disconnect();
})();
