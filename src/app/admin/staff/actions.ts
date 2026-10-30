"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type StaffActionState = { error?: string; ok?: boolean };

const schema = z.object({
  userId: z.string().min(1),
  staffRole: z.enum(["", "JUDGE", "STUDIO_OP"], { error: "نقش نامعتبر است" }),
});

/** تعیین نقش محدود کاربر در پنل. نقش در هر درخواست از پایگاه‌داده خوانده می‌شود و فوراً اثر دارد. */
export async function setStaffRoleAction(prevState: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const admin = await requireAdmin();
  const parsed = schema.safeParse({ userId: formData.get("userId"), staffRole: formData.get("staffRole") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const { userId, staffRole } = parsed.data;

  const before = await prisma.user.findUnique({ where: { id: userId }, select: { staffRole: true } });
  if (!before) return { error: "کاربر پیدا نشد" };
  await prisma.user.update({ where: { id: userId }, data: { staffRole } });
  await audit(admin.id, "user.set_staff_role", userId, { before: before.staffRole, after: staffRole });
  revalidatePath("/admin/staff");
  return { ok: true };
}
