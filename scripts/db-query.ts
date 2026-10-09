import "dotenv/config";
import { prisma } from "../src/lib/db";
(async () => {
  const ideas = await prisma.idea.findMany({ select: { id: true, title: true, teamId: true } });
  const teams = await prisma.team.findMany({
    select: { id: true, name: true, slug: true, solo: true, cheatPenalty: true, _count: { select: { members: true } } },
  });
  const products = await prisma.product.findMany({
    select: { id: true, name: true, teamId: true, price: true, submittedAt: true, liveStatus: true },
  });
  const users = await prisma.user.findMany({ select: { email: true, buyWallet: true, teamId: true } });
  const coinOrders = await prisma.coinOrder.groupBy({ by: ["status"], _count: { _all: true }, _sum: { coins: true } });
  console.log(JSON.stringify({ ideas, teams, products, users, coinOrders }, null, 1));
  await prisma.$disconnect();
})();
