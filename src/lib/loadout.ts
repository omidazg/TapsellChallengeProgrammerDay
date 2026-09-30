import { z } from "zod";
import { prisma } from "./db";
import { getPhase } from "./phase";
import { ROLES, POWERS, type RoleKey, type PowerKey } from "./constants";
import { notifyUser, notifyUsers } from "./notifications";
import { getLeaderState, teamManageError } from "./leader";

/**
 * «چیدمان» هر بازیکن = نقش + قدرت. قواعد (در /guide هم توضیح داده شده‌اند):
 *
 * ۱) نقش و قدرت در ثبت‌نام انتخاب می‌شوند ولی قطعی نیستند؛ تا وقتی بازی شروع نشده (فاز «ثبت‌نام و تیم»)
 *    هر بازیکن می‌تواند از پروفایل یا «تنظیمات تیم» آن‌ها را عوض کند تا تیم با هماهنگی ترکیبش را بهینه کند.
 * ۲) سرپرست تیم (یا تنها عضوِ تیم یک‌نفره) از «تنظیمات تیم» می‌تواند نقش و قدرت همهٔ اعضا را هم تنظیم کند؛
 *    به عضوی که چیدمانش عوض شد اعلان می‌رسد.
 * ۳) با شروع «اتاق ایده» همه‌چیز قفل می‌شود. قدرتی که مصرف شده (یا سپری که روی تیمی نشسته) هرگز عوض نمی‌شود.
 * ۴) نام و نشان تیم هم در همین بازه فقط به‌دست سرپرست قابل تغییر است.
 */

export type LoadoutResult = { ok?: boolean; error?: string };

const ERR = {
  locked: "بازی شروع شده؛ نقش، قدرت و تنظیمات تیم فقط تا پایان فاز «ثبت‌نام و تیم» قابل تغییرند.",
  noUser: "کاربر یافت نشد.",
  notTeammate: "فقط می‌توانی چیدمان هم‌تیمی‌های خودت را تنظیم کنی.",
  notLeader: "فقط سرپرست تیم می‌تواند نقش و قدرت بقیهٔ اعضا را تغییر دهد؛ چیدمان خودت را از پروفایل عوض کن.",
  powerSpent: "این قدرت استفاده شده و دیگر قابل تعویض نیست.",
  nameTaken: "این نام تیم قبلاً استفاده شده است.",
  invalid: "نقش یا قدرت انتخاب‌شده معتبر نیست.",
} as const;

const roleEnum = z.enum(Object.keys(ROLES) as [RoleKey, ...RoleKey[]]);
const powerEnum = z.enum(Object.keys(POWERS) as [PowerKey, ...PowerKey[]]);
const loadoutSchema = z.object({ role: roleEnum, power: powerEnum });

/** نقش و قدرت فقط پیش از شروع بازی (فاز ثبت‌نام) قابل تغییرند */
export function loadoutPhaseOpen(phase: string) {
  return phase === "REGISTRATION";
}

export async function isLoadoutOpen() {
  const { phase } = await getPhase();
  return loadoutPhaseOpen(phase);
}

/** بذر آواتار همان قالب ثبت‌نام و ویرایش پروفایل است؛ با تغییر نقش/قدرت آواتار هم تازه می‌شود */
function avatarSeedFor(u: { role: string; power: string; coffee: number; bugs: number; sleep: number; confidence: number; nickname: string }) {
  return `${u.role}-${u.power}-${u.coffee}-${u.bugs}-${u.sleep}-${u.confidence}-${u.nickname}`;
}

/**
 * تغییر نقش و قدرت یک بازیکن.
 * actor خودش (همیشه تا پیش از شروع بازی) یا سرپرست تیمِ target.
 */
export async function updateLoadout(
  actorId: string,
  targetId: string,
  input: { role: string; power: string }
): Promise<LoadoutResult> {
  const parsed = loadoutSchema.safeParse(input);
  if (!parsed.success) return { error: ERR.invalid };
  const { role, power } = parsed.data;

  if (!(await isLoadoutOpen())) return { error: ERR.locked };

  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { id: true, nickname: true, teamId: true } }),
    prisma.user.findUnique({ where: { id: targetId } }),
  ]);
  if (!actor || !target) return { error: ERR.noUser };

  const self = actor.id === target.id;
  if (!self) {
    if (!actor.teamId || actor.teamId !== target.teamId) return { error: ERR.notTeammate };
    if (await teamManageError(actor)) return { error: ERR.notLeader };
  }

  const powerChanged = target.power !== power;
  if (powerChanged && (target.powerUsed || target.shieldTeamId)) return { error: ERR.powerSpent };
  if (target.role === role && !powerChanged) return { ok: true };

  // شرط روی مقدار قبلی جلوی بازنویسی هم‌زمان دو ویرایش (مثلاً خود عضو و سرپرست) را می‌گیرد
  const res = await prisma.user.updateMany({
    where: { id: target.id, role: target.role, power: target.power, powerUsed: false, shieldTeamId: null },
    data: { role, power, avatarSeed: avatarSeedFor({ ...target, role, power }) },
  });
  if (res.count === 0) return { error: "چیدمان همین حالا تغییر کرده است؛ صفحه را تازه کن و دوباره تلاش کن." };

  const summary = `${ROLES[role].emoji} ${ROLES[role].label} · ${POWERS[power].emoji} ${POWERS[power].label}`;
  if (!self) {
    await notifyUser(target.id, {
      kind: "team_loadout",
      title: "سرپرست چیدمانت را تنظیم کرد",
      body: `${actor.nickname} نقش و قدرتت را به «${summary}» تغییر داد. اگر موافق نیستی با تیم هماهنگ کن.`,
      href: "/team/settings",
    });
  } else if (target.teamId) {
    const mates = await prisma.user.findMany({
      where: { teamId: target.teamId, NOT: { id: target.id } },
      select: { id: true },
    });
    await notifyUsers(
      mates.map((m) => m.id),
      {
        kind: "team_loadout",
        title: "هم‌تیمی‌ات چیدمانش را عوض کرد",
        body: `${target.nickname} حالا «${summary}» است.`,
        href: "/team/settings",
      }
    );
  }
  return { ok: true };
}

const teamSettingsSchema = z.object({
  name: z.string().trim().min(2, "نام تیم خیلی کوتاه است").max(40, "نام تیم خیلی بلند است"),
  shuffleLogo: z.boolean().optional(),
});

/** تغییر نام تیم و/یا نشان آن — فقط سرپرست و فقط پیش از شروع بازی. اسلاگ ثابت می‌ماند تا لینک دعوت نشکند. */
export async function updateTeamSettings(
  actorId: string,
  input: { name: string; shuffleLogo?: boolean }
): Promise<LoadoutResult> {
  const parsed = teamSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "اطلاعات نامعتبر است." };
  if (!(await isLoadoutOpen())) return { error: ERR.locked };

  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true, nickname: true, teamId: true } });
  if (!actor?.teamId) return { error: "ابتدا باید عضو یک تیم باشی." };
  const denied = await teamManageError(actor);
  if (denied) return { error: denied };

  const team = await prisma.team.findUnique({ where: { id: actor.teamId }, select: { name: true } });
  if (!team) return { error: "تیم یافت نشد." };
  const { name, shuffleLogo } = parsed.data;
  const renamed = name !== team.name;
  if (!renamed && !shuffleLogo) return { ok: true };

  try {
    await prisma.team.update({
      where: { id: actor.teamId },
      data: {
        ...(renamed ? { name } : {}),
        ...(shuffleLogo ? { logoSeed: `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` } : {}),
      },
    });
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") return { error: ERR.nameTaken };
    return { error: "ذخیره نشد؛ دوباره تلاش کن." };
  }

  if (renamed) {
    const mates = await prisma.user.findMany({
      where: { teamId: actor.teamId, NOT: { id: actor.id } },
      select: { id: true },
    });
    await notifyUsers(
      mates.map((m) => m.id),
      { kind: "team_settings", title: "نام تیم عوض شد", body: `${actor.nickname} نام تیم را به «${name}» تغییر داد.`, href: "/team" }
    );
  }
  return { ok: true };
}

export type LoadoutMember = {
  id: string;
  nickname: string;
  avatarSeed: string;
  role: RoleKey;
  power: PowerKey;
  powerLocked: boolean;
  isLeader: boolean;
};

export type TeamLoadoutView = {
  open: boolean;
  canManage: boolean;
  manageReason: string | null;
  leaderId: string | null;
  members: LoadoutMember[];
  /** نقش‌هایی که هیچ عضوی ندارد */
  missingRoles: RoleKey[];
  /** قدرت‌هایی که بیش از یک عضو انتخاب کرده‌اند (تنوع کمتر = گزینه‌های کمتر در بازی) */
  duplicatePowers: PowerKey[];
};

/** همهٔ داده‌های صفحهٔ «تنظیمات تیم» */
export async function getTeamLoadoutView(user: { id: string; teamId: string | null }): Promise<TeamLoadoutView | null> {
  if (!user.teamId) return null;
  const [open, members, state, reason] = await Promise.all([
    isLoadoutOpen(),
    prisma.user.findMany({
      where: { teamId: user.teamId },
      orderBy: { createdAt: "asc" },
      select: { id: true, nickname: true, avatarSeed: true, role: true, power: true, powerUsed: true, shieldTeamId: true },
    }),
    getLeaderState(user.teamId),
    teamManageError(user),
  ]);

  const powerCount = new Map<string, number>();
  for (const m of members) powerCount.set(m.power, (powerCount.get(m.power) ?? 0) + 1);
  const roles = new Set(members.map((m) => m.role));

  return {
    open,
    canManage: reason === null,
    manageReason: reason,
    leaderId: state.leaderId,
    members: members.map((m) => ({
      id: m.id,
      nickname: m.nickname,
      avatarSeed: m.avatarSeed || m.id,
      role: m.role as RoleKey,
      power: m.power as PowerKey,
      powerLocked: m.powerUsed || !!m.shieldTeamId,
      isLeader: m.id === state.leaderId,
    })),
    missingRoles: (Object.keys(ROLES) as RoleKey[]).filter((r) => !roles.has(r)),
    duplicatePowers: (Object.keys(POWERS) as PowerKey[]).filter((p) => (powerCount.get(p) ?? 0) > 1),
  };
}
