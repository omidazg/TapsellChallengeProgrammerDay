import { z } from "zod";
import { prisma } from "./db";
import { getPhase, phaseIndex } from "./phase";
import { ROLES, type RoleKey } from "./constants";
import { notifyUser } from "./notifications";
import { fa } from "./persian";

/** ظرفیت هر تیم */
export const TEAM_FULL = 3;

/** نتیجهٔ استاندارد اکشن‌های تیم */
export type TeamResult = { ok?: boolean; error?: string };

const ERR = {
  noUser: "کاربر یافت نشد.",
  phase: "این کار فقط تا پایان فاز «اتاق ایده» ممکن است.",
  leavePhase: "خروج از تیم فقط در فاز ثبت‌نام و تیم امکان‌پذیر است.",
  alreadyInTeam: "شما قبلاً عضو یک تیم هستید.",
  notInTeam: "شما عضو هیچ تیمی نیستید.",
  teamFull: "تیم پر است؛ ظرفیت هر تیم سه نفر است.",
  targetFull: "این تیم پر شده است.",
  nameTaken: "این نام تیم قبلاً استفاده شده است.",
  inviteSelf: "نمی‌توانی خودت را دعوت کنی.",
  inviteeHasTeam: "این کاربر قبلاً عضو یک تیم است.",
  inviteDuplicate: "این ایمیل قبلاً دعوت شده است.",
  inviteInvalid: "این دعوت‌نامه دیگر معتبر نیست.",
  leaveHasIdea: "تیم شما ایده یا محصول ثبت کرده؛ برای ترک تیم با برگزارکننده هماهنگ کن.",
  raced: "وضعیت تیم تغییر کرده است؛ صفحه را تازه کن و دوباره تلاش کن.",
  teamNotFound: "تیمی با این لینک پیدا نشد.",
} as const;

/** تیم به‌همراه اعضا، ایده، محصول و دعوت‌های در انتظار */
export async function getTeamWithMembers(teamId: string) {
  return prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { orderBy: { createdAt: "asc" } },
      idea: true,
      product: true,
      invites: { where: { status: "PENDING" }, include: { inviter: true }, orderBy: { createdAt: "desc" } },
    },
  });
}

export type TeamWithMembers = NonNullable<Awaited<ReturnType<typeof getTeamWithMembers>>>;

export type RoleCoverage = {
  role: RoleKey;
  label: string;
  emoji: string;
  present: boolean;
};

/** پوشش سه نقش در بین اعضای تیم */
export function roleCoverage(members: { role: string }[]): RoleCoverage[] {
  const present = new Set(members.map((m) => m.role));
  return (Object.keys(ROLES) as RoleKey[]).map((role) => ({
    role,
    label: ROLES[role].label,
    emoji: ROLES[role].emoji,
    present: present.has(role),
  }));
}

function randomId(len = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** اسلاگ URL-safe از نام تیم؛ نام‌های فارسی به شناسهٔ تصادفی می‌رسند */
export function slugify(name: string) {
  const ascii = name
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii || `team-${randomId(8)}`;
}

/** اسلاگ یکتا در دیتابیس (با پسوند شمارشی در صورت تکرار) */
export async function uniqueSlug(name: string) {
  const base = slugify(name);
  let slug = base;
  let i = 1;
  while (await prisma.team.findUnique({ where: { slug } })) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}

/** نام یکتای پیش‌فرض «تیم شمارهٔ N» برای هم‌تیم‌سازی خودکار */
export async function nextAutoTeamName() {
  const count = await prisma.team.count();
  let n = count + 1;
  while (await prisma.team.findUnique({ where: { name: `تیم شمارهٔ ${n}` } })) {
    n++;
  }
  return `تیم شمارهٔ ${n}`;
}

async function isRegistrationPhase() {
  const { phase } = await getPhase();
  return phase === "REGISTRATION";
}

/** تشکیل/تکمیل تیم (ساخت، دعوت، پیوستن) تا پایان فاز «اتاق ایده» باز است */
async function isTeamFormingPhase() {
  const { phase } = await getPhase();
  return phaseIndex(phase) <= phaseIndex("IDEATION");
}

/** به اعضای فعلی تیم (به‌جز خود عضو تازه) اطلاع می‌دهد که عضو جدیدی پیوست */
async function notifyTeamOfNewMember(teamId: string, joinedUserId: string, joinedNickname: string) {
  const members = await prisma.user.findMany({
    where: { teamId, NOT: { id: joinedUserId } },
    select: { id: true },
  });
  await Promise.all(
    members.map((m) =>
      notifyUser(m.id, {
        kind: "team_join",
        title: "عضو جدید به تیم پیوست",
        body: `${joinedNickname} به تیم پیوست.`,
        href: "/team",
      })
    )
  );
}

/** تیم تازه می‌سازد و کاربر را در همان تراکنش عضو آن می‌کند */
const createTeamSchema = z.object({
  name: z.string().trim().min(2, "نام تیم خیلی کوتاه است").max(40, "نام تیم خیلی بلند است"),
});

export async function createTeamForUser(userId: string, name: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  if (!(await isTeamFormingPhase())) return { error: ERR.phase };
  if (user.teamId) return { error: ERR.alreadyInTeam };

  const parsed = createTeamSchema.safeParse({ name });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "نام تیم نامعتبر است." };

  const slug = await uniqueSlug(parsed.data.name);
  try {
    await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({ data: { name: parsed.data.name, slug, logoSeed: slug } });
      // شرط teamId: null از عضویت هم‌زمان در دو تیم جلوگیری می‌کند
      const moved = await tx.user.updateMany({ where: { id: userId, teamId: null }, data: { teamId: team.id } });
      if (moved.count === 0) throw new Error("RACED");
    });
  } catch (e) {
    if (e instanceof Error && e.message === "RACED") return { error: ERR.alreadyInTeam };
    return { error: ERR.nameTaken };
  }
  return { ok: true };
}

/**
 * هم‌تیم‌سازی خودکار: تیمی که نقش کاربر را ندارد و جا دارد (پرترین تیم اول،
 * تا تیم‌های نیمه‌کاره کامل شوند)؛ در نبودِ چنین تیمی، تیم تازه ساخته می‌شود.
 */
export async function joinMatchmaking(userId: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  if (!(await isTeamFormingPhase())) return { error: ERR.phase };
  if (user.teamId) return { error: ERR.alreadyInTeam };

  const teams = await prisma.team.findMany({
    include: { members: { select: { role: true } } },
    orderBy: { createdAt: "asc" },
  });
  const candidates = teams
    .filter((t) => t.members.length > 0 && t.members.length < TEAM_FULL)
    .filter((t) => !t.members.some((m) => m.role === user.role))
    .sort((a, b) => b.members.length - a.members.length);

  const target = candidates[0];
  if (target) {
    const moved = await prisma.user.updateMany({ where: { id: userId, teamId: null }, data: { teamId: target.id } });
    if (moved.count === 0) return { error: ERR.alreadyInTeam };
    await notifyTeamOfNewMember(target.id, userId, user.nickname);
    return { ok: true };
  }

  const name = await nextAutoTeamName();
  return createTeamForUser(userId, name);
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(120, "ایمیل نامعتبر است").email("ایمیل نامعتبر است"),
});

/** ثبت دعوت‌نامه برای تیمِ کاربر */
export async function inviteToTeam(userId: string, email: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  if (!(await isTeamFormingPhase())) return { error: ERR.phase };
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی." };

  const parsed = inviteSchema.safeParse({ email });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ایمیل نامعتبر است." };
  const target = parsed.data.email;

  if (target === user.email.trim().toLowerCase()) return { error: ERR.inviteSelf };

  const memberCount = await prisma.user.count({ where: { teamId: user.teamId } });
  if (memberCount >= TEAM_FULL) return { error: ERR.teamFull };

  const invitee = await prisma.user.findUnique({ where: { email: target } });
  if (invitee?.teamId) return { error: ERR.inviteeHasTeam };

  const existingInvite = await prisma.teamInvite.findFirst({
    where: { teamId: user.teamId, email: target, status: "PENDING" },
  });
  if (existingInvite) return { error: ERR.inviteDuplicate };

  const team = await prisma.team.findUnique({ where: { id: user.teamId } });
  await prisma.teamInvite.create({ data: { teamId: user.teamId, email: target, inviterId: user.id } });

  if (invitee) {
    await notifyUser(invitee.id, {
      kind: "team_invite",
      title: "دعوت به تیم",
      body: `${user.nickname} تو را به تیم «${team?.name ?? ""}» دعوت کرد.`,
      href: team ? `/join/${team.slug}` : "/team",
    });
  }

  return { ok: true };
}

/** پذیرش دعوت: فاز، نداشتن تیم و ظرفیت تیم مقصد دوباره بررسی می‌شود */
export async function acceptInvite(userId: string, inviteId: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  if (!(await isTeamFormingPhase())) return { error: ERR.phase };
  if (user.teamId) return { error: ERR.alreadyInTeam };

  if (typeof inviteId !== "string" || !inviteId) return { error: ERR.inviteInvalid };
  const invite = await prisma.teamInvite.findUnique({ where: { id: inviteId }, include: { team: true } });
  if (!invite || invite.status !== "PENDING" || invite.email !== user.email.trim().toLowerCase()) {
    return { error: ERR.inviteInvalid };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const memberCount = await tx.user.count({ where: { teamId: invite.teamId } });
      if (memberCount >= TEAM_FULL) throw new Error("FULL");
      const moved = await tx.user.updateMany({ where: { id: userId, teamId: null }, data: { teamId: invite.teamId } });
      if (moved.count === 0) throw new Error("RACED");
      const claimed = await tx.teamInvite.updateMany({
        where: { id: invite.id, status: "PENDING" },
        data: { status: "ACCEPTED" },
      });
      if (claimed.count === 0) throw new Error("INVALID");
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "FULL") return { error: ERR.targetFull };
    if (m === "RACED") return { error: ERR.alreadyInTeam };
    if (m === "INVALID") return { error: ERR.inviteInvalid };
    return { error: ERR.raced };
  }
  await notifyTeamOfNewMember(invite.teamId, userId, user.nickname);
  return { ok: true };
}

/**
 * پیوستن به تیم از طریق لینک دعوت (اسلاگ تیم). تکرار نقش مجاز است؛ هشدار در UI نشان داده می‌شود.
 */
export async function joinBySlug(userId: string, slug: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  if (!(await isTeamFormingPhase())) return { error: ERR.phase };
  if (user.teamId) return { error: ERR.alreadyInTeam };

  const team = await prisma.team.findUnique({ where: { slug } });
  if (!team) return { error: ERR.teamNotFound };

  try {
    await prisma.$transaction(async (tx) => {
      const memberCount = await tx.user.count({ where: { teamId: team.id } });
      if (memberCount >= TEAM_FULL) throw new Error("FULL");
      const moved = await tx.user.updateMany({ where: { id: userId, teamId: null }, data: { teamId: team.id } });
      if (moved.count === 0) throw new Error("RACED");
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "FULL") return { error: ERR.targetFull };
    if (m === "RACED") return { error: ERR.alreadyInTeam };
    return { error: ERR.raced };
  }
  await notifyTeamOfNewMember(team.id, userId, user.nickname);
  return { ok: true };
}

export type TeamPreview = {
  id: string;
  name: string;
  slug: string;
  logoSeed: string;
  memberCount: number;
  full: boolean;
  coverage: RoleCoverage[];
};

/** پیش‌نمایش تیم از روی اسلاگ — برای صفحهٔ لینک دعوت، بدون نیاز به عضویت */
export async function getTeamPreviewBySlug(slug: string): Promise<TeamPreview | null> {
  const team = await prisma.team.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logoSeed: true,
      members: { select: { role: true } },
    },
  });
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    logoSeed: team.logoSeed,
    memberCount: team.members.length,
    full: team.members.length >= TEAM_FULL,
    coverage: roleCoverage(team.members),
  };
}

/** رد دعوت (در هر فازی مجاز است) */
export async function declineInvite(userId: string, inviteId: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };

  if (typeof inviteId !== "string" || !inviteId) return { error: ERR.inviteInvalid };
  const invite = await prisma.teamInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.status !== "PENDING" || invite.email !== user.email.trim().toLowerCase()) {
    return { error: ERR.inviteInvalid };
  }
  const done = await prisma.teamInvite.updateMany({
    where: { id: invite.id, status: "PENDING" },
    data: { status: "DECLINED" },
  });
  if (done.count === 0) return { error: ERR.inviteInvalid };
  return { ok: true };
}

/**
 * ترک تیم؛ اگر تیم خالی شود همراه وابسته‌هایش حذف می‌شود.
 * در schema.prisma هیچ onDelete: Cascade تعریف نشده، پس رکوردهای وابسته
 * باید صریح پاک شوند وگرنه حذف تیم با خطای کلید خارجی شکست می‌خورد.
 */
export async function leaveTeam(userId: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  if (!(await isRegistrationPhase())) return { error: ERR.leavePhase };
  if (!user.teamId) return { error: ERR.notInTeam };

  const teamId = user.teamId;
  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { idea: true, product: true } });
  if (team?.idea || team?.product) return { error: ERR.leaveHasIdea };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { teamId: null } });
    const remaining = await tx.user.count({ where: { teamId } });
    if (remaining > 0) return;
    // تیم خالی شد: وابسته‌ها را صریح پاک کن، بعد خود تیم را
    await tx.teamInvite.deleteMany({ where: { teamId } });
    await tx.adSlotBid.deleteMany({ where: { teamId } });
    await tx.collusionFlag.deleteMany({ where: { OR: [{ teamId }, { otherTeamId: teamId }] } });
    await tx.teamScore.deleteMany({ where: { teamId } });
    await tx.team.delete({ where: { id: teamId } });
  });

  return { ok: true };
}

// ---------- ابزارهای برگزارکننده (بدون قفل فاز) ----------

/** انتقال کاربر به تیم دیگر؛ سقف سه‌نفره رعایت می‌شود */
export async function adminMoveUserToTeam(userId: string, targetTeamId: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  const target = await prisma.team.findUnique({ where: { id: targetTeamId } });
  if (!target) return { error: "تیم مقصد پیدا نشد." };
  if (user.teamId === targetTeamId) return { error: "کاربر همین حالا عضو این تیم است." };

  try {
    await prisma.$transaction(async (tx) => {
      const count = await tx.user.count({ where: { teamId: targetTeamId } });
      if (count >= TEAM_FULL) throw new Error("FULL");
      await tx.user.update({ where: { id: userId }, data: { teamId: targetTeamId } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FULL") return { error: ERR.targetFull };
    return { error: ERR.raced };
  }
  return { ok: true };
}

/**
 * ادغام دو تیم: همهٔ اعضای تیم B به تیم A منتقل می‌شوند و تیم B حذف می‌شود،
 * به‌شرط اینکه مجموع اعضا از سقف بیشتر نشود و تیم B ایده/محصولی ثبت نکرده باشد.
 */
export async function adminMergeTeams(teamAId: string, teamBId: string): Promise<TeamResult> {
  if (teamAId === teamBId) return { error: "نمی‌توان یک تیم را با خودش ادغام کرد." };

  const [teamA, teamB] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamAId }, include: { members: true } }),
    prisma.team.findUnique({ where: { id: teamBId }, include: { members: true, idea: true, product: true } }),
  ]);
  if (!teamA || !teamB) return { error: "یکی از تیم‌ها پیدا نشد." };
  if (teamB.idea || teamB.product) {
    return { error: "تیم دوم ایده یا محصول ثبت کرده؛ ادغام ممکن نیست." };
  }
  const total = teamA.members.length + teamB.members.length;
  if (total > TEAM_FULL) {
    return { error: `ظرفیت کافی نیست؛ مجموع اعضا (${fa(total)}) از ${fa(TEAM_FULL)} بیشتر می‌شود.` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({ where: { teamId: teamBId }, data: { teamId: teamAId } });
      await tx.teamInvite.deleteMany({ where: { teamId: teamBId } });
      await tx.adSlotBid.deleteMany({ where: { teamId: teamBId } });
      await tx.collusionFlag.deleteMany({ where: { OR: [{ teamId: teamBId }, { otherTeamId: teamBId }] } });
      await tx.teamScore.deleteMany({ where: { teamId: teamBId } });
      await tx.team.delete({ where: { id: teamBId } });
    });
  } catch {
    return { error: ERR.raced };
  }
  return { ok: true };
}

/** تیم تازه می‌سازد و بی‌درنگ کاربر را عضو می‌کند — بدون قفل فاز (فقط برای ابزار برگزارکننده) */
async function adminCreateTeamForUser(userId: string): Promise<{ ok: true; teamId: string; teamName: string } | { ok: false }> {
  const name = await nextAutoTeamName();
  const slug = await uniqueSlug(name);
  try {
    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.team.create({ data: { name, slug, logoSeed: slug } });
      await tx.user.update({ where: { id: userId }, data: { teamId: created.id } });
      return created;
    });
    return { ok: true, teamId: team.id, teamName: team.name };
  } catch {
    return { ok: false };
  }
}

/** کاربر را به تیمی با جای خالی عضو می‌کند — بدون قفل فاز (فقط برای ابزار برگزارکننده) */
async function adminAssignUserToTeam(userId: string, teamId: string): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      const count = await tx.user.count({ where: { teamId } });
      if (count >= TEAM_FULL) throw new Error("FULL");
      await tx.user.update({ where: { id: userId }, data: { teamId } });
    });
    return true;
  } catch {
    return false;
  }
}

export type AutoComposeSummary = {
  assigned: { userId: string; nickname: string; teamId: string; teamName: string; createdNewTeam: boolean }[];
  teamsCreated: number;
  remainingTeamless: number;
};

/**
 * هم‌تیم‌سازی خودکار برای کاربران بی‌تیم: هر کاربر ترجیحاً به نیمه‌کاره‌ترین
 * تیمی که نقشش را ندارد ملحق می‌شود؛ در نبودِ چنین تیمی، به هر تیم نیمه‌کاره‌ای
 * با جای خالی (حتی با تکرار نقش)، و در نهایت تیم تازه‌ای برایش ساخته می‌شود.
 */
export async function autoComposeTeams(): Promise<AutoComposeSummary> {
  const teamless = await prisma.user.findMany({ where: { teamId: null }, orderBy: { createdAt: "asc" } });

  const teamsRaw = await prisma.team.findMany({ include: { members: { select: { role: true } } } });
  type TeamState = { id: string; name: string; roles: Set<string>; count: number };
  const teams: TeamState[] = teamsRaw
    .filter((t) => t.members.length < TEAM_FULL)
    .map((t) => ({ id: t.id, name: t.name, roles: new Set(t.members.map((m) => m.role)), count: t.members.length }));

  const assigned: AutoComposeSummary["assigned"] = [];
  let teamsCreated = 0;
  let remainingTeamless = 0;

  for (const user of teamless) {
    const target =
      teams.filter((t) => t.count < TEAM_FULL && !t.roles.has(user.role)).sort((a, b) => b.count - a.count)[0] ??
      teams.filter((t) => t.count < TEAM_FULL).sort((a, b) => b.count - a.count)[0];

    if (target) {
      const ok = await adminAssignUserToTeam(user.id, target.id);
      if (ok) {
        target.roles.add(user.role);
        target.count++;
        assigned.push({ userId: user.id, nickname: user.nickname, teamId: target.id, teamName: target.name, createdNewTeam: false });
        continue;
      }
    }

    const created = await adminCreateTeamForUser(user.id);
    if (created.ok) {
      teamsCreated++;
      teams.push({ id: created.teamId, name: created.teamName, roles: new Set([user.role]), count: 1 });
      assigned.push({ userId: user.id, nickname: user.nickname, teamId: created.teamId, teamName: created.teamName, createdNewTeam: true });
    } else {
      remainingTeamless++;
    }
  }

  return { assigned, teamsCreated, remainingTeamless };
}
