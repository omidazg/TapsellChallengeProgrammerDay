"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { adminMoveUserToTeam, adminMergeTeams, autoComposeTeams } from "@/lib/team";
import { audit } from "@/lib/audit";
import { invalidate } from "@/lib/ttl-cache";

export type TeamsActionState = { error?: string; ok?: boolean };

const renameSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1, "نام تیم را بنویس").max(60, "نام خیلی طولانی است"),
});

export async function renameTeamAction(prevState: TeamsActionState, formData: FormData): Promise<TeamsActionState> {
  const admin = await requireAdmin();
  const parsed = renameSchema.safeParse({ teamId: formData.get("teamId"), name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };

  const dup = await prisma.team.findFirst({ where: { name: parsed.data.name, NOT: { id: parsed.data.teamId } } });
  if (dup) return { error: "تیمی با این نام از قبل هست" };

  const before = await prisma.team.findUnique({ where: { id: parsed.data.teamId }, select: { name: true } });
  if (!before) return { error: "تیم پیدا نشد" };
  try {
    await prisma.team.update({ where: { id: parsed.data.teamId }, data: { name: parsed.data.name } });
  } catch {
    // برخورد هم‌زمان با قید یکتای نام
    return { error: "تیمی با این نام از قبل هست" };
  }
  await audit(admin.id, "team.rename", parsed.data.teamId, { before: before?.name ?? null, after: parsed.data.name });
  revalidatePath("/admin/teams");
  return { ok: true };
}

const memberSchema = z.object({ userId: z.string().min(1) });

export async function removeMemberAction(prevState: TeamsActionState, formData: FormData): Promise<TeamsActionState> {
  const admin = await requireAdmin();
  const parsed = memberSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };

  const before = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { teamId: true } });
  if (!before) return { error: "کاربر پیدا نشد" };
  if (!before.teamId) return { error: "این کاربر عضو تیمی نیست" };
  await prisma.user.update({ where: { id: parsed.data.userId }, data: { teamId: null } });
  await audit(admin.id, "team.remove_member", parsed.data.userId, { fromTeamId: before?.teamId ?? null });
  revalidatePath("/admin/teams");
  return { ok: true };
}

const teamSchema = z.object({ teamId: z.string().min(1) });

export async function deleteTeamAction(prevState: TeamsActionState, formData: FormData): Promise<TeamsActionState> {
  const admin = await requireAdmin();
  const parsed = teamSchema.safeParse({ teamId: formData.get("teamId") });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };

  const team = await prisma.team.findUnique({
    where: { id: parsed.data.teamId },
    include: { members: { select: { id: true } }, idea: { select: { id: true } }, product: { select: { id: true } } },
  });
  if (!team) return { error: "تیم پیدا نشد" };
  if (team.members.length > 0) return { error: "فقط تیم خالی را می‌توان حذف کرد" };
  // ایده/محصول به حمایت‌ها و خریدهای دیگران گره خورده‌اند؛ حذفشان دفتر کل را ناقص می‌کند.
  if (team.idea || team.product) return { error: "این تیم ایده یا محصول ثبت کرده و قابل حذف نیست" };

  // ردیف‌های وابسته (دعوت‌نامه، پیشنهاد جایگاه، پرچم، امتیاز) کلید خارجی دارند و بدون پاک‌شدن،
  // حذف تیم با خطای پایگاه‌داده شکست می‌خورد — همان الگوی adminMergeTeams در lib/team.ts.
  try {
    await prisma.$transaction(async (tx) => {
      const count = await tx.user.count({ where: { teamId: team.id } });
      if (count > 0) throw new Error("NOT_EMPTY");
      await tx.teamInvite.deleteMany({ where: { teamId: team.id } });
      await tx.adSlotBid.deleteMany({ where: { teamId: team.id } });
      await tx.collusionFlag.deleteMany({ where: { OR: [{ teamId: team.id }, { otherTeamId: team.id }] } });
      await tx.teamScore.deleteMany({ where: { teamId: team.id } });
      await tx.team.delete({ where: { id: team.id } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_EMPTY") return { error: "فقط تیم خالی را می‌توان حذف کرد" };
    console.error("deleteTeamAction failed", e);
    return { error: "حذف تیم ممکن نشد؛ دوباره تلاش کن" };
  }
  await audit(admin.id, "team.delete", team.id, { name: team.name });
  revalidatePath("/admin/teams");
  return { ok: true };
}

const moveSchema = z.object({ userId: z.string().min(1), targetTeamId: z.string().min(1) });

/** انتقال یک کاربر (عضو تیمی یا بی‌تیم) به تیم دیگر؛ سقف سه‌نفره رعایت می‌شود */
export async function moveMemberAction(prevState: TeamsActionState, formData: FormData): Promise<TeamsActionState> {
  const admin = await requireAdmin();
  const parsed = moveSchema.safeParse({ userId: formData.get("userId"), targetTeamId: formData.get("targetTeamId") });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };

  const before = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { teamId: true } });
  const res = await adminMoveUserToTeam(parsed.data.userId, parsed.data.targetTeamId);
  if (res.error) return { error: res.error };
  await audit(admin.id, "team.move_member", parsed.data.userId, {
    fromTeamId: before?.teamId ?? null,
    toTeamId: parsed.data.targetTeamId,
  });
  revalidatePath("/admin/teams");
  return { ok: true };
}

const mergeSchema = z.object({
  teamAId: z.string().min(1, "تیم اول را انتخاب کن"),
  teamBId: z.string().min(1, "تیم دوم را انتخاب کن"),
});

/** ادغام دو تیم: اعضای تیم دوم به تیم اول منتقل می‌شوند و تیم دوم حذف می‌شود */
export async function mergeTeamsAction(prevState: TeamsActionState, formData: FormData): Promise<TeamsActionState> {
  const admin = await requireAdmin();
  const parsed = mergeSchema.safeParse({ teamAId: formData.get("teamAId"), teamBId: formData.get("teamBId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };

  const res = await adminMergeTeams(parsed.data.teamAId, parsed.data.teamBId);
  if (res.error) return { error: res.error };
  await audit(admin.id, "team.merge", parsed.data.teamAId, {
    keptTeamId: parsed.data.teamAId,
    removedTeamId: parsed.data.teamBId,
  });
  revalidatePath("/admin/teams");
  return { ok: true };
}

export type AutoComposeState = { error?: string; summary?: string };

/** تشکیل خودکار تیم‌ها برای کاربران بی‌تیم و تکمیل تیم‌های نیمه‌کاره */
export async function autoComposeAction(): Promise<AutoComposeState> {
  const admin = await requireAdmin();
  let result: Awaited<ReturnType<typeof autoComposeTeams>>;
  try {
    result = await autoComposeTeams();
  } catch (e) {
    console.error("autoComposeAction failed", e);
    return { error: "تشکیل خودکار تیم‌ها با خطا روبه‌رو شد" };
  }
  await audit(admin.id, "team.auto_compose", "", {
    assigned: result.assigned.length,
    teamsCreated: result.teamsCreated,
    remainingTeamless: result.remainingTeamless,
  });
  revalidatePath("/admin/teams");

  if (result.assigned.length === 0) {
    return { summary: "هیچ کاربر بی‌تیمی برای جا‌به‌جایی پیدا نشد." };
  }
  const lines = result.assigned.map(
    (a) => `${a.nickname} → ${a.teamName}${a.createdNewTeam ? " (تیم تازه)" : ""}`
  );
  const tail = result.remainingTeamless > 0 ? `\n${result.remainingTeamless} کاربر بدون تیم باقی ماند.` : "";
  return {
    summary: `${lines.join("\n")}\n\n${result.assigned.length} کاربر جا‌به‌جا شد؛ ${result.teamsCreated} تیم تازه ساخته شد.${tail}`,
  };
}

const cheatSchema = z.object({
  teamId: z.string().min(1),
  cheatPenalty: z.coerce
    .number({ error: "کسر امتیاز باید عدد باشد" })
    .int("کسر امتیاز باید عدد صحیح باشد")
    .min(0, "کسر امتیاز نمی‌تواند منفی باشد")
    .max(1000, "کسر امتیاز حداکثر ۱۰۰۰ است"),
  cheatNote: z.string().trim().max(300, "توضیح خیلی طولانی است").default(""),
});

/** ثبت کسر امتیاز تقلب (تأییدشده توسط برگزارکننده) و توضیح آن؛ صفر یعنی بدون کسر */
export async function setCheatPenaltyAction(prevState: TeamsActionState, formData: FormData): Promise<TeamsActionState> {
  const admin = await requireAdmin();
  const parsed = cheatSchema.safeParse({
    teamId: formData.get("teamId"),
    cheatPenalty: String(formData.get("cheatPenalty") ?? "").trim() || "0",
    cheatNote: formData.get("cheatNote") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const { teamId, cheatPenalty, cheatNote } = parsed.data;
  if (cheatPenalty > 0 && !cheatNote) return { error: "دلیل کسر امتیاز را بنویس؛ برای تیم نمایش داده می‌شود" };

  const before = await prisma.team.findUnique({ where: { id: teamId }, select: { cheatPenalty: true, cheatNote: true } });
  if (!before) return { error: "تیم پیدا نشد" };
  await prisma.team.update({ where: { id: teamId }, data: { cheatPenalty, cheatNote: cheatPenalty > 0 ? cheatNote : "" } });
  await audit(admin.id, "team.cheat_penalty", teamId, { before, after: { cheatPenalty, cheatNote } });
  invalidate("scores:");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/settlement");
  revalidatePath("/leaderboard");
  revalidatePath("/results");
  revalidatePath("/team");
  return { ok: true };
}
