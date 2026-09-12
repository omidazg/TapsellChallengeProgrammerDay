"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { adminMoveUserToTeam, adminMergeTeams, autoComposeTeams } from "@/lib/team";

export type TeamsActionState = { error?: string; ok?: boolean };

const renameSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1, "نام تیم را بنویس").max(60, "نام خیلی طولانی است"),
});

export async function renameTeamAction(prevState: TeamsActionState, formData: FormData): Promise<TeamsActionState> {
  await requireAdmin();
  const parsed = renameSchema.safeParse({ teamId: formData.get("teamId"), name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };

  const dup = await prisma.team.findFirst({ where: { name: parsed.data.name, NOT: { id: parsed.data.teamId } } });
  if (dup) return { error: "تیمی با این نام از قبل هست" };

  await prisma.team.update({ where: { id: parsed.data.teamId }, data: { name: parsed.data.name } });
  revalidatePath("/admin/teams");
  return { ok: true };
}

const memberSchema = z.object({ userId: z.string().min(1) });

export async function removeMemberAction(prevState: TeamsActionState, formData: FormData): Promise<TeamsActionState> {
  await requireAdmin();
  const parsed = memberSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };

  await prisma.user.update({ where: { id: parsed.data.userId }, data: { teamId: null } });
  revalidatePath("/admin/teams");
  return { ok: true };
}

const teamSchema = z.object({ teamId: z.string().min(1) });

export async function deleteTeamAction(prevState: TeamsActionState, formData: FormData): Promise<TeamsActionState> {
  await requireAdmin();
  const parsed = teamSchema.safeParse({ teamId: formData.get("teamId") });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };

  const team = await prisma.team.findUnique({ where: { id: parsed.data.teamId }, include: { members: true } });
  if (!team) return { error: "تیم پیدا نشد" };
  if (team.members.length > 0) return { error: "فقط تیم خالی را می‌توان حذف کرد" };

  await prisma.team.delete({ where: { id: team.id } });
  revalidatePath("/admin/teams");
  return { ok: true };
}

const moveSchema = z.object({ userId: z.string().min(1), targetTeamId: z.string().min(1) });

/** انتقال یک کاربر (عضو تیمی یا بی‌تیم) به تیم دیگر؛ سقف سه‌نفره رعایت می‌شود */
export async function moveMemberAction(prevState: TeamsActionState, formData: FormData): Promise<TeamsActionState> {
  await requireAdmin();
  const parsed = moveSchema.safeParse({ userId: formData.get("userId"), targetTeamId: formData.get("targetTeamId") });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };

  const res = await adminMoveUserToTeam(parsed.data.userId, parsed.data.targetTeamId);
  if (res.error) return { error: res.error };
  revalidatePath("/admin/teams");
  return { ok: true };
}

const mergeSchema = z.object({
  teamAId: z.string().min(1, "تیم اول را انتخاب کن"),
  teamBId: z.string().min(1, "تیم دوم را انتخاب کن"),
});

/** ادغام دو تیم: اعضای تیم دوم به تیم اول منتقل می‌شوند و تیم دوم حذف می‌شود */
export async function mergeTeamsAction(prevState: TeamsActionState, formData: FormData): Promise<TeamsActionState> {
  await requireAdmin();
  const parsed = mergeSchema.safeParse({ teamAId: formData.get("teamAId"), teamBId: formData.get("teamBId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };

  const res = await adminMergeTeams(parsed.data.teamAId, parsed.data.teamBId);
  if (res.error) return { error: res.error };
  revalidatePath("/admin/teams");
  return { ok: true };
}

export type AutoComposeState = { error?: string; summary?: string };

/** تشکیل خودکار تیم‌ها برای کاربران بی‌تیم و تکمیل تیم‌های نیمه‌کاره */
export async function autoComposeAction(): Promise<AutoComposeState> {
  await requireAdmin();
  const result = await autoComposeTeams();
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
