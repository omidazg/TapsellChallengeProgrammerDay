"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { updateTeamSettings, type TeamSettingsResult } from "@/lib/team-settings";

/** نام و نشان تیم — هر عضو تیم، تا وقتی بخش تیم باز است */
export async function updateTeamSettingsAction(input: { name: string; shuffleLogo?: boolean }): Promise<TeamSettingsResult> {
  const user = await requireUser();
  const res = await updateTeamSettings(user.id, { name: String(input?.name ?? ""), shuffleLogo: !!input?.shuffleLogo });
  if (res.ok) {
    revalidatePath("/profile");
    revalidatePath("/team");
    revalidatePath("/team/settings");
  }
  return res;
}
