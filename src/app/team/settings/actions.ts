"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { updateLoadout, updateTeamSettings, type LoadoutResult } from "@/lib/loadout";

function revalidateAll() {
  revalidatePath("/profile");
  revalidatePath("/team");
  revalidatePath("/team/settings");
}

/** تغییر نقش و قدرت — برای خود کاربر (targetId خالی) یا، اگر سرپرست است، یکی از هم‌تیمی‌ها */
export async function updateLoadoutAction(input: { targetId?: string; role: string; power: string }): Promise<LoadoutResult> {
  const user = await requireUser();
  const res = await updateLoadout(user.id, String(input.targetId || user.id), {
    role: String(input.role ?? ""),
    power: String(input.power ?? ""),
  });
  if (res.ok) revalidateAll();
  return res;
}

export async function updateTeamSettingsAction(input: { name: string; shuffleLogo?: boolean }): Promise<LoadoutResult> {
  const user = await requireUser();
  const res = await updateTeamSettings(user.id, { name: String(input.name ?? ""), shuffleLogo: !!input.shuffleLogo });
  if (res.ok) revalidateAll();
  return res;
}
