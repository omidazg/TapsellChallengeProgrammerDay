"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPhase } from "@/lib/phase";
import { uniqueSlug, nextAutoTeamName } from "@/lib/team";

const TEAM_FULL = 3;

async function requireRegistrationPhase() {
  const { phase } = await getPhase();
  if (phase !== "REGISTRATION") {
    return "این کار فقط در فاز ثبت‌نام و تیم ممکن است.";
  }
  return null;
}

const createTeamSchema = z.object({ name: z.string().trim().min(2, "نام تیم خیلی کوتاه است").max(40, "نام تیم خیلی بلند است") });

export async function createTeamAction(input: { name: string }): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const phaseError = await requireRegistrationPhase();
  if (phaseError) return { error: phaseError };
  if (user.teamId) return { error: "شما قبلاً عضو یک تیم هستید." };

  const parsed = createTeamSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "نام تیم نامعتبر است." };

  const slug = await uniqueSlug(parsed.data.name);
  try {
    await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({ data: { name: parsed.data.name, slug, logoSeed: slug } });
      await tx.user.update({ where: { id: user.id }, data: { teamId: team.id } });
    });
  } catch {
    return { error: "این نام تیم قبلاً استفاده شده است." };
  }

  revalidatePath("/team");
  return { ok: true };
}

export async function joinMatchmakingAction(): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const phaseError = await requireRegistrationPhase();
  if (phaseError) return { error: phaseError };
  if (user.teamId) return { error: "شما قبلاً عضو یک تیم هستید." };

  const candidates = await prisma.team.findMany({ include: { members: true } });
  const open = candidates.filter((t) => t.members.length < TEAM_FULL);

  const withoutRole = open.find((t) => !t.members.some((m) => m.role === user.role));
  const target = withoutRole ?? open[0];

  if (target) {
    await prisma.user.update({ where: { id: user.id }, data: { teamId: target.id } });
  } else {
    const name = await nextAutoTeamName();
    const slug = await uniqueSlug(name);
    await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({ data: { name, slug, logoSeed: slug } });
      await tx.user.update({ where: { id: user.id }, data: { teamId: team.id } });
    });
  }

  revalidatePath("/team");
  return { ok: true };
}

export async function leaveTeamAction(): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const phaseError = await requireRegistrationPhase();
  if (phaseError) return { error: "خروج از تیم فقط در فاز ثبت‌نام و تیم امکان‌پذیر است." };
  if (!user.teamId) return { error: "شما عضو هیچ تیمی نیستید." };

  const teamId = user.teamId;
  await prisma.user.update({ where: { id: user.id }, data: { teamId: null } });
  const remaining = await prisma.user.count({ where: { teamId } });
  if (remaining === 0) {
    await prisma.team.delete({ where: { id: teamId } }).catch(() => {});
  }

  revalidatePath("/team");
  return { ok: true };
}

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email("ایمیل نامعتبر است") });

export async function inviteAction(input: { email: string }): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const phaseError = await requireRegistrationPhase();
  if (phaseError) return { error: phaseError };
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی." };

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ایمیل نامعتبر است." };

  const memberCount = await prisma.user.count({ where: { teamId: user.teamId } });
  if (memberCount >= TEAM_FULL) return { error: "تیم پر است؛ ظرفیت هر تیم سه نفر است." };

  const invitee = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (invitee?.teamId) return { error: "این کاربر قبلاً عضو یک تیم است." };

  const existingInvite = await prisma.teamInvite.findFirst({
    where: { teamId: user.teamId, email: parsed.data.email, status: "PENDING" },
  });
  if (existingInvite) return { error: "این ایمیل قبلاً دعوت شده است." };

  await prisma.teamInvite.create({
    data: { teamId: user.teamId, email: parsed.data.email, inviterId: user.id },
  });

  revalidatePath("/team");
  return { ok: true };
}

export async function acceptInviteAction(inviteId: string): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const phaseError = await requireRegistrationPhase();
  if (phaseError) return { error: phaseError };
  if (user.teamId) return { error: "شما قبلاً عضو یک تیم هستید." };

  const invite = await prisma.teamInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.email !== user.email || invite.status !== "PENDING") {
    return { error: "این دعوت‌نامه دیگر معتبر نیست." };
  }

  const memberCount = await prisma.user.count({ where: { teamId: invite.teamId } });
  if (memberCount >= TEAM_FULL) return { error: "این تیم پر شده است." };

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { teamId: invite.teamId } }),
    prisma.teamInvite.update({ where: { id: invite.id }, data: { status: "ACCEPTED" } }),
  ]);

  revalidatePath("/team");
  return { ok: true };
}

export async function declineInviteAction(inviteId: string): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const invite = await prisma.teamInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.email !== user.email || invite.status !== "PENDING") {
    return { error: "این دعوت‌نامه دیگر معتبر نیست." };
  }
  await prisma.teamInvite.update({ where: { id: invite.id }, data: { status: "DECLINED" } });
  revalidatePath("/team");
  return { ok: true };
}
