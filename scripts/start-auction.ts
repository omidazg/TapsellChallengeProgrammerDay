import "dotenv/config";
import { prisma } from "../src/lib/db";
import { ensureAuctions, startNextAuction, listAuctions } from "../src/lib/auction";
(async () => {
  await ensureAuctions();
  const a = await startNextAuction(300);
  console.log("started:", a ? a.id : null);
  console.log(JSON.stringify(await listAuctions(), null, 1).slice(0, 600));
  await prisma.$disconnect();
})();
