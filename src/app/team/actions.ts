"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  createTeamForUser,
  joinMatchmaking,
  inviteToTeam,
  acceptInvite,
  declineInvite,
  leaveTeam,
  joinBySlug,
  type TeamResult,
} from "@/lib/team";

/** پس از هر تغییر عضویت، صفحه‌هایی که ترکیب تیم را نشان می‌دهند تازه می‌شوند */
function revalidate(res: TeamResult) {
  if (res.ok) {
    revalidatePath("/team");
    revalidatePath("/profile");
  }
  return res;
}

export async function createTeamAction(input: { name: string }): Promise<TeamResult> {
  const user = await requireUser();
  return revalidate(await createTeamForUser(user.id, input?.name ?? ""));
}

export async function joinMatchmakingAction(): Promise<TeamResult> {
  const user = await requireUser();
  return revalidate(await joinMatchmaking(user.id));
}

export async function leaveTeamAction(): Promise<TeamResult> {
  const user = await requireUser();
  return revalidate(await leaveTeam(user.id));
}

export async function inviteAction(input: { email: string }): Promise<TeamResult> {
  const user = await requireUser();
  const res = await inviteToTeam(user.id, input?.email ?? "");
  if (res.ok) revalidatePath("/team");
  return res;
}

export async function acceptInviteAction(inviteId: string): Promise<TeamResult> {
  const user = await requireUser();
  return revalidate(await acceptInvite(user.id, inviteId));
}

export async function declineInviteAction(inviteId: string): Promise<TeamResult> {
  const user = await requireUser();
  const res = await declineInvite(user.id, inviteId);
  if (res.ok) revalidatePath("/team");
  return res;
}

/** پیوستن از طریق لینک دعوت؛ در صورت موفقیت به /team با پرچم موفقیت هدایت می‌کند */
export async function joinBySlugAction(slug: string): Promise<TeamResult | never> {
  const user = await requireUser();
  const res = await joinBySlug(user.id, slug);
  if (res.ok) {
    revalidatePath("/team");
    revalidatePath("/profile");
    redirect("/team?joined=1");
  }
  return res;
}
