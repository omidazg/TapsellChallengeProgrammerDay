import "dotenv/config";
import { prisma } from "../src/lib/db";
(async () => {
  const ideas = await prisma.idea.findMany({ select: { id: true, title: true, teamId: true } });
  const teams = await prisma.team.findMany({ select: { id: true, name: true, slug: true, treasury: true } });
  const users = await prisma.user.findMany({ select: { email: true, seedWallet: true, buyWallet: true, teamId: true } });
  console.log(JSON.stringify({ ideas, teams, users }, null, 1));
  await prisma.$disconnect();
})();
