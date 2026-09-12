import { prisma } from "./db";

/** جمع سرمایهٔ جذب‌شدهٔ یک ایده */
export async function raisedFor(ideaId: string): Promise<number> {
  const agg = await prisma.investment.aggregate({
    where: { ideaId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export type IdeaCardData = {
  id: string;
  teamId: string;
  teamName: string;
  teamLogoSeed: string;
  title: string;
  oneLiner: string;
  coverUrl: string;
  fundingCap: number;
  revenueShare: number;
  raised: number;
  investorCount: number;
  analystClarity: number | null;
  analystFeasibility: number | null;
  analystNovelty: number | null;
  submittedAt: Date | null;
};

function analystAvg(i: { analystClarity: number | null; analystFeasibility: number | null; analystNovelty: number | null }) {
  const vals = [i.analystClarity, i.analystFeasibility, i.analystNovelty].filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** فهرست همهٔ ایده‌های ثبت‌نهایی‌شده برای طبقهٔ سرمایه‌گذاری */
export async function getIdeasForFloor(): Promise<IdeaCardData[]> {
  const ideas = await prisma.idea.findMany({
    where: { submittedAt: { not: null } },
    include: {
      team: { select: { id: true, name: true, logoSeed: true } },
      investments: { select: { amount: true, userId: true } },
    },
  });
  return ideas
    .map((i) => ({
      id: i.id,
      teamId: i.teamId,
      teamName: i.team.name,
      teamLogoSeed: i.team.logoSeed,
      title: i.title,
      oneLiner: i.oneLiner,
      coverUrl: i.coverUrl,
      fundingCap: i.fundingCap,
      revenueShare: i.revenueShare,
      raised: i.investments.reduce((a, inv) => a + inv.amount, 0),
      investorCount: new Set(i.investments.map((inv) => inv.userId)).size,
      analystClarity: i.analystClarity,
      analystFeasibility: i.analystFeasibility,
      analystNovelty: i.analystNovelty,
      submittedAt: i.submittedAt,
    }))
    .sort((a, b) => b.raised - a.raised);
}

export { analystAvg };

export type IdeaDetail = {
  id: string;
  teamId: string;
  teamName: string;
  teamLogoSeed: string;
  title: string;
  oneLiner: string;
  problem: string;
  audience: string;
  buildPlan: string;
  coverUrl: string;
  fundingCap: number;
  revenueShare: number;
  analystClarity: number | null;
  analystFeasibility: number | null;
  analystNovelty: number | null;
  analystSummary: string | null;
  submittedAt: Date | null;
  raised: number;
  investments: { id: string; userId: string; nickname: string; avatarSeed: string; amount: number; createdAt: Date }[];
  isOwnTeam: boolean;
  viewerInvested: number;
  chats: { id: string; userId: string; nickname: string; avatarSeed: string; question: string; answer: string; createdAt: Date }[];
};

/** جزئیات کامل یک ایده برای صفحهٔ سرمایه‌گذاری، از دید یک بازدیدکنندهٔ خاص */
export async function getIdeaDetail(id: string, viewerId: string | null): Promise<IdeaDetail | null> {
  const idea = await prisma.idea.findUnique({
    where: { id },
    include: {
      team: { select: { id: true, name: true, logoSeed: true } },
      investments: { include: { user: { select: { id: true, nickname: true, avatarSeed: true } } }, orderBy: { createdAt: "desc" } },
      chats: { include: { user: { select: { id: true, nickname: true, avatarSeed: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!idea) return null;

  let viewerTeamId: string | null = null;
  if (viewerId) {
    const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { teamId: true } });
    viewerTeamId = viewer?.teamId ?? null;
  }

  return {
    id: idea.id,
    teamId: idea.teamId,
    teamName: idea.team.name,
    teamLogoSeed: idea.team.logoSeed,
    title: idea.title,
    oneLiner: idea.oneLiner,
    problem: idea.problem,
    audience: idea.audience,
    buildPlan: idea.buildPlan,
    coverUrl: idea.coverUrl,
    fundingCap: idea.fundingCap,
    revenueShare: idea.revenueShare,
    analystClarity: idea.analystClarity,
    analystFeasibility: idea.analystFeasibility,
    analystNovelty: idea.analystNovelty,
    analystSummary: idea.analystSummary,
    submittedAt: idea.submittedAt,
    raised: idea.investments.reduce((a, inv) => a + inv.amount, 0),
    investments: idea.investments.map((inv) => ({
      id: inv.id,
      userId: inv.userId,
      nickname: inv.user.nickname,
      avatarSeed: inv.user.avatarSeed,
      amount: inv.amount,
      createdAt: inv.createdAt,
    })),
    isOwnTeam: viewerTeamId !== null && viewerTeamId === idea.teamId,
    viewerInvested: viewerId ? idea.investments.filter((inv) => inv.userId === viewerId).reduce((a, inv) => a + inv.amount, 0) : 0,
    chats: idea.chats.map((c) => ({
      id: c.id,
      userId: c.userId,
      nickname: c.user.nickname,
      avatarSeed: c.user.avatarSeed,
      question: c.question,
      answer: c.answer,
      createdAt: c.createdAt,
    })),
  };
}

/** پایین‌ترین ایدهٔ سرمایه‌گذاری‌شده (به جز تیم خود کاربر) — برای اعتبارسنجی قدرت فرشته */
export async function lowestRaisedIdeaId(excludeTeamId: string | null): Promise<string | null> {
  const ideas = await getIdeasForFloor();
  const candidates = ideas.filter((i) => i.teamId !== excludeTeamId);
  if (candidates.length === 0) return null;
  let lowest = candidates[0];
  for (const i of candidates) {
    if (i.raised < lowest.raised) lowest = i;
  }
  return lowest.id;
}
