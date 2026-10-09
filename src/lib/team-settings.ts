import { z } from "zod";
import { prisma } from "./db";
import { getPhase, phaseIndex, type Phase } from "./phase";
import { ROLES, type RoleKey } from "./constants";
import { notifyUsers } from "./notifications";

export type TeamSettingsResult = { ok?: boolean; error?: string };

/** نام و نشان تیم تا پایان «اتاق ایده» قابل تغییرند (پس از آن روی ایده و محصول نمایش داده می‌شوند). */
export function teamSettingsPhaseOpen(phase: Phase) {
  return phaseIndex(phase) <= phaseIndex("IDEATION");
}

export async function isTeamSettingsOpen() {
  const { phase } = await getPhase();
  return teamSettingsPhaseOpen(phase);
}

const teamSettingsSchema = z.object({
  name: z.string().trim().min(2, "نام تیم خیلی کوتاه است").max(40, "نام تیم خیلی بلند است"),
  shuffleLogo: z.boolean().optional(),
});

/** تغییر نام تیم و/یا نشان آن — هر عضو تیم. اسلاگ ثابت می‌ماند تا لینک دعوت نشکند. */
export async function updateTeamSettings(
  actorId: string,
  input: { name: string; shuffleLogo?: boolean }
): Promise<TeamSettingsResult> {
  const parsed = teamSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "اطلاعات نامعتبر است." };
  if (!(await isTeamSettingsOpen())) return { error: "نام و نشان تیم فقط تا پایان «اتاق ایده» قابل تغییرند." };

  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true, nickname: true, teamId: true } });
  if (!actor?.teamId) return { error: "ابتدا باید عضو یک تیم باشی." };

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
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") return { error: "این نام تیم قبلاً استفاده شده است." };
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

const roleEnum = z.enum(Object.keys(ROLES) as [RoleKey, ...RoleKey[]]);

/** تغییر برچسب مهارت خود کاربر (فقط برای معرفی و هم‌تیم‌یابی؛ اثری در امتیاز ندارد). */
export async function updateSkill(userId: string, role: string): Promise<TeamSettingsResult> {
  const parsed = roleEnum.safeParse(role);
  if (!parsed.success) return { error: "مهارت انتخاب‌شده معتبر نیست." };
  await prisma.user.update({ where: { id: userId }, data: { role: parsed.data } });
  return { ok: true };
}
