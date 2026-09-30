import { prisma } from "./db";
import { fa } from "./persian";
import { notifyTeam } from "./notifications";

/**
 * سرپرست تیم — قواعد (همین‌ها در /guide برای بازیکن توضیح داده شده‌اند):
 *
 * ۱) تیمِ یک‌نفره سرپرست رسمی ندارد؛ تنها عضوش خودش همه‌چیز را مدیریت می‌کند.
 * ۲) از وقتی تیم دست‌کم دو عضو دارد، رأی‌گیری باز است. هر عضو به یک نفر (از جمله خودش) رأی می‌دهد.
 * ۳) هر کس رأی اکثریت اعضای فعلی را بگیرد (تیم سه‌نفره: ۲ از ۳؛ دونفره: ۲ از ۲) خودکار سرپرست می‌شود.
 * ۴) تا وقتی کسی به اکثریت نرسیده، هر عضو می‌تواند رأیش را عوض کند تا تیم قفل نماند.
 * ۵) پس از انتخاب، رأی‌ها بسته می‌شوند. اگر سرپرست از تیم برود، یا برگزارکننده رأی‌گیری را از نو باز کند،
 *    رأی‌ها پاک و رأی‌گیری دوباره باز می‌شود. برگزارکننده در صورت نیاز می‌تواند مستقیماً سرپرست تعیین کند.
 * ۶) فقط سرپرست کارهای تیمی (ایده، محصول، پیشنهاد جایگاه تبلیغاتی) را ثبت و ویرایش می‌کند؛ بقیه همه‌چیز را می‌بینند.
 *    کارهای شخصی (سرمایه‌گذاری، خرید، پیشنهاد حراج و قدرت شخصی) مال خود هر عضو است.
 */

/** تعداد رأی لازم برای سرپرستی: اکثریت اعضای فعلی */
export function leaderThreshold(memberCount: number) {
  return Math.floor(memberCount / 2) + 1;
}

export type LeaderState = {
  leaderId: string | null;
  leaderElectedAt: Date | null;
  memberCount: number;
  threshold: number;
  votingOpen: boolean;
  /** رأی هر عضو: voterId → candidateId (فقط رأی‌های اعضای فعلی به اعضای فعلی) */
  votes: Record<string, string>;
  /** candidateId → تعداد رأی */
  tally: Record<string, number>;
};

/**
 * سرپرست ذخیره‌شده را با اعضای فعلی همگام می‌کند: اگر سرپرست دیگر عضو نیست، سرپرستی و رأی‌ها پاک می‌شوند؛
 * رأی‌های کهنه (رأی‌دهنده یا نامزدِ خارج‌شده) حذف می‌شوند و اگر با ترکیب تازه کسی به اکثریت رسیده باشد، انتخاب می‌شود.
 * idempotent است؛ بعد از هر تغییر عضویت و هنگام بازکردن اتاق تیم صدا زده می‌شود.
 */
export async function syncLeader(teamId: string): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { leaderId: true, members: { select: { id: true } } },
  });
  if (!team) return;
  const memberIds = team.members.map((m) => m.id);

  if (team.leaderId && !memberIds.includes(team.leaderId)) {
    await prisma.$transaction([
      prisma.team.update({ where: { id: teamId }, data: { leaderId: null, leaderElectedAt: null } }),
      prisma.teamLeaderVote.deleteMany({ where: { teamId } }),
    ]);
    await notifyTeam(teamId, {
      kind: "team_leader",
      title: "رأی‌گیری سرپرست دوباره باز شد",
      body: "سرپرست قبلی دیگر عضو تیم نیست؛ به یکی از اعضا رأی بدهید.",
      href: "/team",
    });
  }

  await prisma.teamLeaderVote.deleteMany({
    where: { teamId, OR: [{ voterId: { notIn: memberIds } }, { candidateId: { notIn: memberIds } }] },
  });
  await resolveElection(teamId);
}

export async function getLeaderState(teamId: string): Promise<LeaderState> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { leaderId: true, leaderElectedAt: true, members: { select: { id: true } } },
  });
  const memberIds = new Set(team?.members.map((m) => m.id) ?? []);
  const rows = await prisma.teamLeaderVote.findMany({ where: { teamId } });

  const votes: Record<string, string> = {};
  const tally: Record<string, number> = {};
  for (const r of rows) {
    if (!memberIds.has(r.voterId) || !memberIds.has(r.candidateId)) continue;
    votes[r.voterId] = r.candidateId;
    tally[r.candidateId] = (tally[r.candidateId] ?? 0) + 1;
  }
  const leaderId = team?.leaderId && memberIds.has(team.leaderId) ? team.leaderId : null;
  return {
    leaderId,
    leaderElectedAt: leaderId ? team?.leaderElectedAt ?? null : null,
    memberCount: memberIds.size,
    threshold: leaderThreshold(memberIds.size),
    votingOpen: !leaderId && memberIds.size >= 2,
    votes,
    tally,
  };
}

/** اگر نامزدی به اکثریت رسیده و تیم هنوز سرپرست ندارد، او را سرپرست می‌کند */
async function resolveElection(teamId: string): Promise<string | null> {
  const state = await getLeaderState(teamId);
  if (!state.votingOpen) return null;
  const winner = Object.entries(state.tally).find(([, n]) => n >= state.threshold);
  if (!winner) return null;
  const [candidateId, count] = winner;

  // شرط leaderId: null تضمین می‌کند دو رأی هم‌زمان دو سرپرست نسازند
  const set = await prisma.team.updateMany({
    where: { id: teamId, leaderId: null },
    data: { leaderId: candidateId, leaderElectedAt: new Date() },
  });
  if (set.count === 0) return null;

  const leader = await prisma.user.findUnique({ where: { id: candidateId }, select: { nickname: true } });
  await notifyTeam(teamId, {
    kind: "team_leader",
    title: "سرپرست تیم انتخاب شد",
    body: `${leader?.nickname ?? "یکی از اعضا"} با ${fa(count)} رأی از ${fa(state.memberCount)} سرپرست تیم شد.`,
    href: "/team",
  });
  return candidateId;
}

export type VoteResult = { ok?: boolean; error?: string; electedId?: string | null };

/** ثبت یا تغییر رأی؛ اگر نامزد به اکثریت برسد همان لحظه سرپرست می‌شود */
export async function castLeaderVote(voterId: string, candidateId: string): Promise<VoteResult> {
  const voter = await prisma.user.findUnique({ where: { id: voterId }, select: { teamId: true } });
  if (!voter?.teamId) return { error: "ابتدا باید عضو یک تیم باشی." };
  const teamId = voter.teamId;

  await syncLeader(teamId);
  const candidate = await prisma.user.findUnique({ where: { id: candidateId }, select: { teamId: true } });
  if (candidate?.teamId !== teamId) return { error: "فقط می‌توانی به یکی از اعضای تیم خودت رأی بدهی." };

  const state = await getLeaderState(teamId);
  if (state.leaderId) return { error: "سرپرست تیم انتخاب شده و رأی‌گیری بسته است." };
  if (!state.votingOpen) return { error: "رأی‌گیری وقتی باز می‌شود که تیم دست‌کم دو عضو داشته باشد." };

  await prisma.teamLeaderVote.upsert({
    where: { voterId },
    update: { teamId, candidateId },
    create: { teamId, voterId, candidateId },
  });
  const electedId = await resolveElection(teamId);
  return { ok: true, electedId };
}

/** پس گرفتن رأی (تا پیش از انتخاب سرپرست) */
export async function withdrawLeaderVote(voterId: string): Promise<VoteResult> {
  const voter = await prisma.user.findUnique({ where: { id: voterId }, select: { teamId: true } });
  if (!voter?.teamId) return { error: "ابتدا باید عضو یک تیم باشی." };
  const state = await getLeaderState(voter.teamId);
  if (state.leaderId) return { error: "سرپرست تیم انتخاب شده و رأی‌گیری بسته است." };
  await prisma.teamLeaderVote.deleteMany({ where: { voterId } });
  return { ok: true };
}

/**
 * آیا این کاربر اجازهٔ تغییرات تیمی دارد؟ null یعنی بله؛ در غیر این صورت پیام فارسیِ دلیل.
 * سرپرست، یا تنها عضوِ تیم یک‌نفره.
 */
export async function teamManageError(user: { id: string; teamId: string | null }): Promise<string | null> {
  if (!user.teamId) return "ابتدا باید عضو یک تیم باشی.";
  const state = await getLeaderState(user.teamId);
  if (state.leaderId === user.id) return null;
  if (!state.leaderId && state.memberCount <= 1) return null;
  if (state.leaderId) {
    const leader = await prisma.user.findUnique({ where: { id: state.leaderId }, select: { nickname: true } });
    return `فقط سرپرست تیم (${leader?.nickname ?? "سرپرست"}) می‌تواند این تغییر را ثبت کند؛ بقیهٔ اعضا همه‌چیز را می‌بینند.`;
  }
  return "تیم هنوز سرپرست ندارد؛ از «اتاق تیم» به یکی از اعضا رأی بدهید تا کسی با اکثریت رأی سرپرست شود.";
}

/** نسخهٔ ساده برای صفحه‌ها: آیا کاربر می‌تواند ویرایش کند، و اگر نه، چرا */
export async function teamAccess(user: { id: string; teamId: string | null }) {
  const reason = await teamManageError(user);
  return { canManage: reason === null, reason };
}

// ---------- ابزار برگزارکننده ----------

export async function adminSetLeader(teamId: string, userId: string): Promise<VoteResult> {
  const member = await prisma.user.findUnique({ where: { id: userId }, select: { teamId: true, nickname: true } });
  if (member?.teamId !== teamId) return { error: "این کاربر عضو این تیم نیست." };
  await prisma.team.update({ where: { id: teamId }, data: { leaderId: userId, leaderElectedAt: new Date() } });
  await notifyTeam(teamId, {
    kind: "team_leader",
    title: "سرپرست تیم تعیین شد",
    body: `برگزارکننده ${member.nickname} را سرپرست تیم کرد.`,
    href: "/team",
  });
  return { ok: true };
}

export async function adminResetLeader(teamId: string): Promise<VoteResult> {
  await prisma.$transaction([
    prisma.team.update({ where: { id: teamId }, data: { leaderId: null, leaderElectedAt: null } }),
    prisma.teamLeaderVote.deleteMany({ where: { teamId } }),
  ]);
  await notifyTeam(teamId, {
    kind: "team_leader",
    title: "رأی‌گیری سرپرست از نو باز شد",
    body: "برگزارکننده رأی‌گیری سرپرست را از نو باز کرد؛ دوباره رأی بدهید.",
    href: "/team",
  });
  return { ok: true };
}
