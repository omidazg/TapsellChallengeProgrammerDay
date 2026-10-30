/**
 * شروع دستی حراج زنده برای تست محلی.
 *
 *   npx tsx scripts/start-auction.ts [مدت‌به‌ثانیه=300] [--set-live]
 *
 * در جریان عادی هر تیم با enqueueAuction محصولش را به صف می‌فرستد؛ این اسکریپت مثل ابزار برگزارکننده
 * همهٔ محصولات ثبت‌شدهٔ باقی‌مانده را با ensureAuctions به صف اضافه و بعد حراج بعدی صف را زنده می‌کند.
 * اگر مسابقه بسته باشد، با --set-live دوباره در جریان می‌شود (با پایان ۲۴ ساعت بعد).
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { getPhase, setPhase } from "../src/lib/phase";
import { ensureAuctions, startNextAuction, listAuctions } from "../src/lib/auction";

const args = process.argv.slice(2);
const SET_LIVE = args.includes("--set-live");
const durationArg = args.find((a) => /^\d+$/.test(a));
const duration = durationArg ? Number(durationArg) : 300;

(async () => {
  const { phase } = await getPhase();
  if (phase !== "LIVE") {
    if (!SET_LIVE) {
      console.error(`وضعیت فعلی ${phase} است؛ حراج زنده فقط وقتی مسابقه در جریان است اجرا می‌شود.`);
      console.error("   npx tsx scripts/set-phase.ts LIVE   یا همین اسکریپت با --set-live");
      await prisma.$disconnect();
      process.exit(1);
    }
    await setPhase("LIVE", new Date(Date.now() + 24 * 3600 * 1000));
    console.log("phase=LIVE");
  }
  await ensureAuctions();
  const a = await startNextAuction(duration);
  console.log("started:", a ? a.id : null);
  console.log(JSON.stringify(await listAuctions(), null, 1).slice(0, 600));
  await prisma.$disconnect();
})();
