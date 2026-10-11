import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getPhase, phaseIndex } from "./phase";
import { ROLES, type RoleKey } from "./constants";
import { notifyUser } from "./notifications";
import { fa } from "./persian";
import { invalidate } from "./ttl-cache";

/** ظرفیت هر تیم (۱ تا ۳ نفر؛ تیم یک‌نفره = شرکت فردی) */
export const TEAM_FULL = 3;

/** نتیجهٔ استاندارد اکشن‌های تیم */
export type TeamResult = { ok?: boolean; error?: string };

const ERR = {
  noUser: "کاربر یافت نشد.",
  phase: "این کار فقط تا پایان فاز «اتاق ایده» ممکن است.",
  leavePhase: "خروج از تیم فقط در فاز ثبت‌نام و تیم امکان‌پذیر است.",
  alreadyInTeam: "تو قبلاً عضو یک تیم هستی.",
  notInTeam: "تو عضو هیچ تیمی نیستی.",
  teamFull: "تیم پر است؛ ظرفیت هر تیم سه نفر است.",
  targetFull: "این تیم پر شده است.",
  nameTaken: "این نام تیم قبلاً استفاده شده است.",
  inviteSelf: "نمی‌توانی خودت را دعوت کنی.",
  inviteeHasTeam: "این کاربر قبلاً عضو یک تیم است.",
  inviteDuplicate: "این ایمیل قبلاً دعوت شده است.",
  inviteInvalid: "این دعوت‌نامه دیگر معتبر نیست.",
  leaveHasIdea: "تیمت ایده یا محصول ثبت کرده؛ برای ترک تیم با برگزارکننده هماهنگ کن.",
  raced: "وضعیت تیم تغییر کرده است؛ صفحه را تازه کن و دوباره تلاش کن.",
  teamNotFound: "تیمی با این لینک پیدا نشد.",
  inviteLinkSolo: "تیم فردی لینک دعوت ندارد؛ اول تیمت را برای هم‌تیمی باز کن.",
  soloClosed: "این شرکت‌کننده فردی بازی می‌کند و هم‌تیمی نمی‌پذیرد.",
  soloHasMates: "تیمت عضو دیگری دارد؛ شرکت فردی فقط برای تیم یک‌نفره است.",
} as const;

/** توکن تصادفی ۱۲۸ بیتی برای لینک دعوت؛ برخلاف اسلاگ، از روی نام یا بازار قابل حدس نیست */
export function newInviteToken() {
  return randomBytes(16).toString("hex");
}

/** فیلدهای عمومی عضو تیم؛ این داده به کامپوننت کلاینت می‌رود، پس هش رمز/ایمیل/شماره نباید در آن باشد */
const PUBLIC_MEMBER = { id: true, nickname: true, role: true, avatarSeed: true, createdAt: true } as const;

/**
 * تیم به‌همراه اعضا، ایده، محصول و دعوت‌های در انتظار.
 * شامل inviteToken است؛ فقط برای نمایش به اعضای همان تیم (اتاق تیم).
 */
export async function getTeamWithMembers(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { orderBy: { createdAt: "asc" }, select: PUBLIC_MEMBER },
      idea: true,
      product: true,
      invites: {
        where: { status: "PENDING" },
        include: { inviter: { select: PUBLIC_MEMBER } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  // ستون nullable است (مهاجرت بدون بازسازی جدول)؛ تیمی که به هر دلیل توکن ندارد همین‌جا می‌گیرد
  if (team && !team.inviteToken) {
    await prisma.team.updateMany({ where: { id: team.id, inviteToken: null }, data: { inviteToken: newInviteToken() } });
    const fresh = await prisma.team.findUnique({ where: { id: team.id }, select: { inviteToken: true } });
    team.inviteToken = fresh?.inviteToken ?? null;
  }
  return team;
}

export type TeamWithMembers = NonNullable<Awaited<ReturnType<typeof getTeamWithMembers>>>;

export type RoleCoverage = {
  role: RoleKey;
  label: string;
  emoji: string;
  present: boolean;
};

/** پوشش مهارت‌ها در بین اعضای تیم (فقط برای نمایش؛ شرط شرکت نیست) */
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
  // اعلان فرعی است؛ خطای آن نباید پیوستنِ ثبت‌شده را برای کاربر «ناموفق» نشان دهد
  try {
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
  } catch (e) {
    console.error("notifyTeamOfNewMember failed", e);
  }
}

/**
 * داخل تراکنش: آیا تیم هنوز عضو تازه می‌پذیرد؟ ظرفیت و «شرکت فردی» دوباره خوانده می‌شوند
 * تا پیوستنِ هم‌زمان با goSolo یا با پیوستنی دیگر از قاعده عبور نکند.
 */
async function assertJoinableTx(tx: Prisma.TransactionClient, teamId: string) {
  const team = await tx.team.findUnique({ where: { id: teamId }, select: { solo: true } });
  if (!team) throw new Error("GONE");
  if (team.solo) throw new Error("SOLO");
  const memberCount = await tx.user.count({ where: { teamId } });
  if (memberCount >= TEAM_FULL) throw new Error("FULL");
}

/**
 * داخل تراکنش: تیم بی‌عضو را همراه وابسته‌هایش حذف می‌کند.
 * در schema.prisma هیچ onDelete: Cascade تعریف نشده، پس رکوردهای وابسته
 * باید صریح پاک شوند وگرنه حذف تیم با خطای کلید خارجی شکست می‌خورد.
 * تیمی که هنوز عضو یا ایده/محصول دارد دست نمی‌خورد؛ خروجی true یعنی حذف شد.
 */
async function deleteEmptyTeamTx(tx: Prisma.TransactionClient, teamId: string): Promise<boolean> {
  if ((await tx.user.count({ where: { teamId } })) > 0) return false;
  const team = await tx.team.findUnique({
    where: { id: teamId },
    select: { idea: { select: { id: true } }, product: { select: { id: true } } },
  });
  if (!team || team.idea || team.product) return false;
  await tx.teamInvite.deleteMany({ where: { teamId } });
  await tx.adSlotBid.deleteMany({ where: { teamId } });
  await tx.collusionFlag.deleteMany({ where: { OR: [{ teamId }, { otherTeamId: teamId }] } });
  await tx.teamScore.deleteMany({ where: { teamId } });
  await tx.teamLeaderVote.deleteMany({ where: { teamId } });
  await tx.team.delete({ where: { id: teamId } });
  return true;
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
    // فقط خطای یکتایی (P2002) یعنی نام تکراری؛ بقیهٔ خطاها را «نام تکراری» جا نزن
    if ((e as { code?: string })?.code === "P2002") return { error: ERR.nameTaken };
    console.error("createTeamForUser failed", e);
    return { error: ERR.raced };
  }
  return { ok: true };
}

/**
 * شرکت فردی: برای کاربر بی‌تیم یک تیم یک‌نفرهٔ «بسته» می‌سازد (نامش همان نام مستعار کاربر است)؛
 * برای عضو تنهای یک تیم، همان تیم را بسته می‌کند. تیم فردی در هم‌تیم‌سازی خودکار و لینک دعوت عضو نمی‌پذیرد.
 * تعداد اعضای تیم (از جمله شرکت فردی) در امتیاز هیچ اثری ندارد.
 */
export async function goSolo(userId: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  if (!(await isTeamFormingPhase())) return { error: ERR.phase };

  if (user.teamId) {
    const teamId = user.teamId;
    // شمارش اعضا و بستن تیم در یک تراکنش: پیوستنِ هم‌زمان (که solo را داخل تراکنش خودش
    // دوباره می‌خواند) یا پیش از این تراکنش ثبت شده و این‌جا دیده می‌شود، یا بعد از آن و رد می‌شود.
    try {
      await prisma.$transaction(async (tx) => {
        const members = await tx.user.findMany({ where: { teamId }, select: { id: true } });
        if (!members.some((m) => m.id === userId)) throw new Error("RACED");
        if (members.length > 1) throw new Error("HAS_MATES");
        await tx.team.update({ where: { id: teamId }, data: { solo: true } });
        await tx.teamInvite.updateMany({ where: { teamId, status: "PENDING" }, data: { status: "DECLINED" } });
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "HAS_MATES") return { error: ERR.soloHasMates };
      if (m !== "RACED") console.error("goSolo failed", e);
      return { error: ERR.raced };
    }
    return { ok: true };
  }

  // نام تیم فردی = نام مستعار؛ اگر گرفته شده بود، پسوند عددی
  const base = user.nickname.trim().slice(0, 32) || "شرکت‌کنندهٔ فردی";
  let name = base;
  for (let i = 2; await prisma.team.findUnique({ where: { name } }); i++) name = `${base} ${fa(i)}`;
  const slug = await uniqueSlug(name);
  try {
    await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({ data: { name, slug, logoSeed: slug, solo: true } });
      const moved = await tx.user.updateMany({ where: { id: userId, teamId: null }, data: { teamId: team.id } });
      if (moved.count === 0) throw new Error("RACED");
    });
  } catch (e) {
    if (e instanceof Error && e.message === "RACED") return { error: ERR.alreadyInTeam };
    if ((e as { code?: string })?.code === "P2002") return { error: ERR.nameTaken };
    console.error("goSolo failed", e);
    return { error: ERR.raced };
  }
  return { ok: true };
}

/** تیم فردی را دوباره برای پذیرفتن هم‌تیمی باز می‌کند. */
export async function openSoloTeam(userId: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  if (!(await isTeamFormingPhase())) return { error: ERR.phase };
  if (!user.teamId) return { error: ERR.notInTeam };
  await prisma.team.update({ where: { id: user.teamId }, data: { solo: false } });
  return { ok: true };
}

/**
 * هم‌تیم‌سازی خودکار: تیمی (غیرفردی) که جا دارد — ترجیحاً تیمی که مهارت کاربر را ندارد، پرترین تیم اول
 * تا تیم‌های نیمه‌کاره کامل شوند؛ در نبودِ چنین تیمی، تیم تازه ساخته می‌شود.
 */
export async function joinMatchmaking(userId: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  if (!(await isTeamFormingPhase())) return { error: ERR.phase };
  if (user.teamId) return { error: ERR.alreadyInTeam };

  const teams = await prisma.team.findMany({
    where: { solo: false },
    include: { members: { select: { role: true } } },
    orderBy: { createdAt: "asc" },
  });
  const open = teams
    .filter((t) => t.members.length > 0 && t.members.length < TEAM_FULL)
    .sort((a, b) => b.members.length - a.members.length);
  const target = open.find((t) => !t.members.some((m) => m.role === user.role)) ?? open[0];
  if (target) {
    // ظرفیت دوباره داخل تراکنش بررسی می‌شود تا دو درخواست هم‌زمان تیم را از سه نفر بیشتر نکنند
    try {
      await prisma.$transaction(async (tx) => {
        await assertJoinableTx(tx, target.id);
        const moved = await tx.user.updateMany({ where: { id: userId, teamId: null }, data: { teamId: target.id } });
        if (moved.count === 0) throw new Error("RACED");
        await tx.teamInvite.updateMany({
          where: { teamId: target.id, email: user.email, status: "PENDING" },
          data: { status: "ACCEPTED" },
        });
      });
    } catch (e) {
      if (e instanceof Error && e.message === "RACED") return { error: ERR.alreadyInTeam };
      return { error: ERR.raced };
    }
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
  const ownTeam = await prisma.team.findUnique({ where: { id: user.teamId }, select: { solo: true } });
  if (ownTeam?.solo) return { error: "تو فردی شرکت کرده‌ای؛ برای دعوت هم‌تیمی اول تیمت را از «اتاق تیم» باز کن." };

  const invitee = await prisma.user.findUnique({ where: { email: target } });
  if (invitee?.teamId) return { error: ERR.inviteeHasTeam };

  const existingInvite = await prisma.teamInvite.findFirst({
    where: { teamId: user.teamId, email: target, status: "PENDING" },
  });
  if (existingInvite) return { error: ERR.inviteDuplicate };

  const team = await prisma.team.findUnique({ where: { id: user.teamId } });
  await prisma.teamInvite.create({ data: { teamId: user.teamId, email: target, inviterId: user.id } });

  if (invitee) {
    try {
      await notifyUser(invitee.id, {
        kind: "team_invite",
        title: "دعوت به تیم",
        body: `${user.nickname} تو را به تیم «${team?.name ?? ""}» دعوت کرد.`,
        // دعوت ایمیلی در «اتاق تیم» پذیرفته می‌شود؛ لینک توکن‌دار پیوستن فقط دست اعضای تیم است
        href: "/team",
      });
    } catch (e) {
      console.error("invite notification failed", e);
    }
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
  if (invite.team.solo) return { error: ERR.soloClosed };

  try {
    await prisma.$transaction(async (tx) => {
      await assertJoinableTx(tx, invite.teamId);
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
    if (m === "SOLO") return { error: ERR.soloClosed };
    if (m === "RACED") return { error: ERR.alreadyInTeam };
    if (m === "INVALID" || m === "GONE") return { error: ERR.inviteInvalid };
    return { error: ERR.raced };
  }
  await notifyTeamOfNewMember(invite.teamId, userId, user.nickname);
  return { ok: true };
}

/** شکل مجاز توکن در URL (hex تصادفی یا uuid پیش‌فرض Prisma) */
function validTokenShape(token: unknown): token is string {
  return typeof token === "string" && token.length >= 16 && token.length <= 64 && /^[A-Za-z0-9-]+$/.test(token);
}

/**
 * پیوستن به تیم از طریق لینک دعوت (/join/<inviteToken>). اسلاگ تیم عمومی است (بازار، جدول امتیاز)،
 * پس پیوستن فقط با توکن تصادفی‌ای ممکن است که اعضای تیم پخش می‌کنند.
 * تکرار نقش مجاز است؛ هشدار در UI نشان داده می‌شود.
 */
export async function joinByInviteToken(userId: string, token: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  if (!(await isTeamFormingPhase())) return { error: ERR.phase };
  if (user.teamId) return { error: ERR.alreadyInTeam };

  if (!validTokenShape(token)) return { error: ERR.teamNotFound };
  const team = await prisma.team.findUnique({ where: { inviteToken: token }, select: { id: true, solo: true } });
  if (!team) return { error: ERR.teamNotFound };
  if (team.solo) return { error: ERR.soloClosed };

  try {
    await prisma.$transaction(async (tx) => {
      // ممکن است عضوی همین حالا لینک را عوض کرده باشد؛ داخل تراکنش دوباره بررسی می‌شود
      const still = await tx.team.count({ where: { id: team.id, inviteToken: token } });
      if (still === 0) throw new Error("GONE");
      await assertJoinableTx(tx, team.id);
      const moved = await tx.user.updateMany({ where: { id: userId, teamId: null }, data: { teamId: team.id } });
      if (moved.count === 0) throw new Error("RACED");
      // دعوت‌نامهٔ در انتظارِ همین تیم برای این کاربر دیگر «در انتظار» نیست
      await tx.teamInvite.updateMany({
        where: { teamId: team.id, email: user.email, status: "PENDING" },
        data: { status: "ACCEPTED" },
      });
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "FULL") return { error: ERR.targetFull };
    if (m === "SOLO") return { error: ERR.soloClosed };
    if (m === "GONE") return { error: ERR.teamNotFound };
    if (m === "RACED") return { error: ERR.alreadyInTeam };
    return { error: ERR.raced };
  }
  await notifyTeamOfNewMember(team.id, userId, user.nickname);
  return { ok: true };
}

/**
 * لینک دعوت تازه برای تیمِ کاربر؛ لینک قبلی بی‌درنگ از کار می‌افتد
 * (مثلاً اگر لینک جایی پخش شده که نباید). هر عضو تیم می‌تواند این کار را بکند.
 */
export async function regenerateInviteToken(userId: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { team: { select: { solo: true } } } });
  if (!user) return { error: ERR.noUser };
  if (!(await isTeamFormingPhase())) return { error: ERR.phase };
  if (!user.teamId || !user.team) return { error: ERR.notInTeam };
  if (user.team.solo) return { error: ERR.inviteLinkSolo };
  await prisma.team.update({ where: { id: user.teamId }, data: { inviteToken: newInviteToken() } });
  return { ok: true };
}

export type TeamPreview = {
  id: string;
  name: string;
  slug: string;
  logoSeed: string;
  memberCount: number;
  full: boolean;
  solo: boolean;
  coverage: RoleCoverage[];
};

/** پیش‌نمایش تیم از روی توکن دعوت — برای صفحهٔ لینک دعوت، بدون نیاز به عضویت */
export async function getTeamPreviewByInviteToken(token: string): Promise<TeamPreview | null> {
  if (!validTokenShape(token)) return null;
  const team = await prisma.team.findUnique({
    where: { inviteToken: token },
    select: {
      id: true,
      name: true,
      slug: true,
      logoSeed: true,
      solo: true,
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
    full: team.members.length >= TEAM_FULL || team.solo,
    solo: team.solo,
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

/** ترک تیم؛ اگر تیم خالی شود همراه وابسته‌هایش حذف می‌شود (deleteEmptyTeamTx). */
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
    // اگر تیم خالی شد: وابسته‌ها و خود تیم پاک می‌شوند
    await deleteEmptyTeamTx(tx, teamId);
  });

  return { ok: true };
}

// ---------- ابزارهای برگزارکننده (بدون قفل فاز) ----------

/**
 * انتقال کاربر به تیم دیگر؛ سقف سه‌نفره رعایت می‌شود.
 * اگر تیم مبدأ خالی شود و ایده/محصولی نداشته باشد حذف می‌شود تا تیم بی‌عضو در جدول امتیاز نماند
 * (تیم خالیِ دارای ایده/محصول می‌ماند؛ scoring.ts تیم بی‌عضو را از جایزه کنار می‌گذارد).
 */
export async function adminMoveUserToTeam(userId: string, targetTeamId: string): Promise<TeamResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: ERR.noUser };
  const target = await prisma.team.findUnique({ where: { id: targetTeamId } });
  if (!target) return { error: "تیم مقصد پیدا نشد." };
  if (user.teamId === targetTeamId) return { error: "کاربر همین حالا عضو این تیم است." };
  const sourceTeamId = user.teamId;

  try {
    await prisma.$transaction(async (tx) => {
      const count = await tx.user.count({ where: { teamId: targetTeamId } });
      if (count >= TEAM_FULL) throw new Error("FULL");
      // شرط teamId: اگر تیم کاربر در همین فاصله عوض شده، انتقال بر پایهٔ دادهٔ کهنه انجام نشود
      const moved = await tx.user.updateMany({ where: { id: userId, teamId: sourceTeamId }, data: { teamId: targetTeamId } });
      if (moved.count === 0) throw new Error("RACED");
      // تیم مقصد دیگر یک‌نفره نیست
      await tx.team.update({ where: { id: targetTeamId }, data: { solo: false } });
      if (sourceTeamId) await deleteEmptyTeamTx(tx, sourceTeamId);
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FULL") return { error: ERR.targetFull };
    return { error: ERR.raced };
  }
  // ترکیب تیم‌ها (و شاید خود فهرست تیم‌ها) عوض شده؛ امتیازهای کش‌شده دیگر معتبر نیستند
  invalidate("scores:");
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
      await tx.team.update({ where: { id: teamAId }, data: { solo: false } });
      // اگر تیم B در همین فاصله ایده/محصول ثبت کرده باشد حذف نمی‌شود و ادغام لغو می‌شود
      if (!(await deleteEmptyTeamTx(tx, teamBId))) throw new Error("RACED");
    });
  } catch {
    return { error: ERR.raced };
  }
  invalidate("scores:");
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
 * هم‌تیم‌سازی خودکار برای کاربران بی‌تیم (تیم‌های فردی کنار گذاشته می‌شوند): هر کاربر ترجیحاً به نیمه‌کاره‌ترین
 * تیمی که مهارتش را ندارد ملحق می‌شود؛ در نبودِ چنین تیمی، به هر تیم نیمه‌کاره‌ای
 * با جای خالی (حتی با تکرار نقش)، و در نهایت تیم تازه‌ای برایش ساخته می‌شود.
 */
export async function autoComposeTeams(): Promise<AutoComposeSummary> {
  const teamless = await prisma.user.findMany({ where: { teamId: null }, orderBy: { createdAt: "asc" } });

  const teamsRaw = await prisma.team.findMany({ where: { solo: false }, include: { members: { select: { role: true } } } });
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
