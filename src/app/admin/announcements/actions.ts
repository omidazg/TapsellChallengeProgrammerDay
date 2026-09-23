"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAnnouncement, toggleAnnouncement, deleteAnnouncement } from "@/lib/notifications";
import { audit } from "@/lib/audit";

export type AnnouncementActionState = { error?: string; ok?: boolean };

export async function createAnnouncementAction(_prev: AnnouncementActionState, formData: FormData): Promise<AnnouncementActionState> {
  const admin = await requireAdmin();
  const text = String(formData.get("text") ?? "").trim();
  const level = String(formData.get("level") ?? "info");
  if (!text) return { error: "متن اطلاعیه نمی‌تواند خالی باشد" };
  if (!["info", "warning", "danger"].includes(level)) return { error: "سطح نامعتبر است" };
  await createAnnouncement(text, level);
  await audit(admin.id, "announcement.create", "", { text, level });
  revalidatePath("/admin/announcements");
  return { ok: true };
}

export async function toggleAnnouncementAction(_prev: AnnouncementActionState, formData: FormData): Promise<AnnouncementActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "1";
  if (!id) return { error: "شناسهٔ نامعتبر" };
  await toggleAnnouncement(id, active);
  await audit(admin.id, "announcement.toggle", id, { active });
  revalidatePath("/admin/announcements");
  return { ok: true };
}

export async function deleteAnnouncementAction(_prev: AnnouncementActionState, formData: FormData): Promise<AnnouncementActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "شناسهٔ نامعتبر" };
  await deleteAnnouncement(id);
  await audit(admin.id, "announcement.delete", id, {});
  revalidatePath("/admin/announcements");
  return { ok: true };
}
