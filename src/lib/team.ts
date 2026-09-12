import { z } from "zod";
import { prisma } from "./db";
import { getPhase } from "./phase";
import { ROLES, type RoleKey } from "./constants";

/** ظرفیت هر تیم */
export const TEAM_FULL = 3;

/** نتیجهٔ استاندارد اکشن‌های تیم */
export type TeamResult = { ok?: boolean; error?: string };

const ERR = {
  noUser: "کاربر یافت نشد.",
  phase: "این کار فقط در فاز ثبت‌نام و تیم ممکن است.",
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

/** تیم تازه می‌سازد و کاربر را در همان تراکنش عضو آن می‌کند */
const createTeamSchema = z.object({
  name: z.string().trim().min(2, "نام تیم خیلی کوتاه است").max(40, "نام تیم خیلی بلند است"),
});

export async function createTeamForUser(userId: string, name: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  if (!(await isRegistrationPhase())) return { error: ERR.phase };
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
  if (!(await isRegistrationPhase())) return { error: ERR.phase };
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
  if (!(await isRegistrationPhase())) return { error: ERR.phase };
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

  await prisma.teamInvite.create({ data: { teamId: user.teamId, email: target, inviterId: user.id } });
  return { ok: true };
}

/** پذیرش دعوت: فاز، نداشتن تیم و ظرفیت تیم مقصد دوباره بررسی می‌شود */
export async function acceptInvite(userId: string, inviteId: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  if (!(await isRegistrationPhase())) return { error: ERR.phase };
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
  return { ok: true };
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
