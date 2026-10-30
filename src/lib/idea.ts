import { prisma } from "./db";
import { ideaAiTag, type AiTagInfo } from "./ai-tag";

// فهرست میزبان‌های مجاز next/image و قاعدهٔ نشانی تصویر در product-utils (قابل‌استفاده در کلاینت) است.
export { isNextImageHost } from "./product-utils";

/** آیا نشانی جلد یک نشانی معتبر http(s) است؟ */
export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** جمع سکهٔ حمایتیِ جذب‌شدهٔ یک ایده */
export async function raisedFor(ideaId: string): Promise<number> {
  const agg = await prisma.investment.aggregate({
    where: { ideaId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export type IdeaCardData = {
  id: string;
  trackId: string;
  teamId: string;
  teamName: string;
  teamLogoSeed: string;
  title: string;
  oneLiner: string;
  coverUrl: string;
  /** جمع سکهٔ حمایتی */
  raised: number;
  /** تعداد حامی یکتا */
  investorCount: number;
  aiTag: AiTagInfo | null;
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

/** چیدمان‌های صفحهٔ حمایت از ایده‌ها (از طریق searchParams) */
export const FLOOR_FILTERS = ["all", "lowest", "topAnalyst"] as const;
export type FloorFilter = (typeof FLOOR_FILTERS)[number];

export function parseFloorFilter(value: string | undefined): FloorFilter {
  return (FLOOR_FILTERS as readonly string[]).includes(value ?? "") ? (value as FloorFilter) : "all";
}

/** فهرست همهٔ ایده‌های ثبت‌نهایی‌شده برای صفحهٔ حمایت */
export async function getIdeasForFloor(filter: FloorFilter = "all", trackId?: string): Promise<IdeaCardData[]> {
  const ideas = await prisma.idea.findMany({
    where: { submittedAt: { not: null }, ...(trackId ? { trackId } : {}), track: { status: { not: "hidden" } } },
    include: {
      team: { select: { id: true, name: true, logoSeed: true } },
      investments: { select: { amount: true, userId: true } },
    },
  });
  return ideas
    .map((i) => ({
      id: i.id,
      trackId: i.trackId,
      teamId: i.teamId,
      teamName: i.team.name,
      teamLogoSeed: i.team.logoSeed,
      title: i.title,
      oneLiner: i.oneLiner,
      coverUrl: i.coverUrl,
      raised: i.investments.reduce((a, inv) => a + inv.amount, 0),
      investorCount: new Set(i.investments.map((inv) => inv.userId)).size,
      aiTag: ideaAiTag(i),
      analystClarity: i.analystClarity,
      analystFeasibility: i.analystFeasibility,
      analystNovelty: i.analystNovelty,
      submittedAt: i.submittedAt,
    }))
    .sort((a, b) => {
      if (filter === "lowest") return a.raised - b.raised;
      if (filter === "topAnalyst") return (analystAvg(b) ?? -1) - (analystAvg(a) ?? -1);
      return b.raised - a.raised;
    });
}

export { analystAvg };

export type IdeaDetail = {
  id: string;
  trackId: string;
  /** آخرین ویرایش پس از ثبت نهایی */
  editedAt: Date | null;
  /** نسخه‌های قبلی ایده، جدیدترین اول */
  revisions: { id: string; title: string; oneLiner: string; problem: string; audience: string; buildPlan: string; createdAt: Date }[];
  /** سکهٔ حمایت این بازدیدکننده که چون پیش از ویرایش ثبت شده قابل پس‌گرفتن است */
  viewerWithdrawable: number;
  teamId: string;
  teamName: string;
  teamLogoSeed: string;
  title: string;
  oneLiner: string;
  problem: string;
  audience: string;
  buildPlan: string;
  coverUrl: string;
  analystClarity: number | null;
  analystFeasibility: number | null;
  analystNovelty: number | null;
  analystSummary: string | null;
  /** پیشنهاد تحلیل‌گر برای تیم و حامی‌ها */
  analystAdvice: string | null;
  aiTag: AiTagInfo | null;
  submittedAt: Date | null;
  raised: number;
  investments: { id: string; userId: string; nickname: string; avatarSeed: string; amount: number; createdAt: Date }[];
  isOwnTeam: boolean;
  viewerInvested: number;
  chats: { id: string; userId: string; nickname: string; avatarSeed: string; question: string; answer: string; createdAt: Date }[];
};

/** جزئیات کامل یک ایده برای صفحهٔ حمایت، از دید یک بازدیدکنندهٔ خاص */
export async function getIdeaDetail(id: string, viewerId: string | null): Promise<IdeaDetail | null> {
  const idea = await prisma.idea.findUnique({
    where: { id },
    include: {
      team: { select: { id: true, name: true, logoSeed: true } },
      investments: { include: { user: { select: { id: true, nickname: true, avatarSeed: true } } }, orderBy: { createdAt: "desc" } },
      chats: { include: { user: { select: { id: true, nickname: true, avatarSeed: true } } }, orderBy: { createdAt: "asc" } },
      revisions: { orderBy: { createdAt: "desc" } },
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
    trackId: idea.trackId,
    editedAt: idea.editedAt,
    revisions: idea.revisions.map((r) => ({
      id: r.id,
      title: r.title,
      oneLiner: r.oneLiner,
      problem: r.problem,
      audience: r.audience,
      buildPlan: r.buildPlan,
      createdAt: r.createdAt,
    })),
    viewerWithdrawable: viewerId
      ? idea.investments
          .filter((inv) => inv.userId === viewerId && !!idea.editedAt && inv.createdAt.getTime() < idea.editedAt.getTime())
          .reduce((a, inv) => a + inv.amount, 0)
      : 0,
    teamId: idea.teamId,
    teamName: idea.team.name,
    teamLogoSeed: idea.team.logoSeed,
    title: idea.title,
    oneLiner: idea.oneLiner,
    problem: idea.problem,
    audience: idea.audience,
    buildPlan: idea.buildPlan,
    coverUrl: idea.coverUrl,
    analystClarity: idea.analystClarity,
    analystFeasibility: idea.analystFeasibility,
    analystNovelty: idea.analystNovelty,
    analystSummary: idea.analystSummary,
    analystAdvice: idea.analystAdvice,
    aiTag: ideaAiTag(idea),
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
