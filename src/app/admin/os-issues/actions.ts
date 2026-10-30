"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type OsIssueActionState = { error?: string; ok?: boolean };

const schema = z.object({
  id: z.string().default(""),
  title: z.string().trim().min(1, "عنوان ایشو را بنویس").max(200, "عنوان خیلی طولانی است"),
  description: z.string().trim().max(2000, "توضیح خیلی طولانی است"),
  url: z
    .string()
    .trim()
    .max(400, "لینک خیلی بلند است")
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "لینک باید با http شروع شود"),
  active: z.boolean(),
});

function revalidateIssuePages() {
  revalidatePath("/admin/os-issues");
  revalidatePath("/build");
}

/** افزودن یا ویرایش ایشو (شناسهٔ خالی یعنی ایشوی تازه) */
export async function saveOsIssueAction(prevState: OsIssueActionState, formData: FormData): Promise<OsIssueActionState> {
  const admin = await requireAdmin();
  const parsed = schema.safeParse({
    id: formData.get("id") ?? "",
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    url: formData.get("url") ?? "",
    active: formData.get("active") === "1",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const { id, ...data } = parsed.data;

  if (id) {
    const before = await prisma.osIssue.findUnique({ where: { id } });
    if (!before) return { error: "ایشو پیدا نشد" };
    await prisma.osIssue.update({ where: { id }, data });
    await audit(admin.id, "os_issue.update", id, { before, after: data });
  } else {
    const created = await prisma.osIssue.create({ data });
    await audit(admin.id, "os_issue.create", created.id, { after: data });
  }
  revalidateIssuePages();
  return { ok: true };
}

export async function deleteOsIssueAction(prevState: OsIssueActionState, formData: FormData): Promise<OsIssueActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const before = await prisma.osIssue.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!before) return { error: "ایشو پیدا نشد" };
  // محصولی که این ایشو را برداشته نباید مرجعش را از دست بدهد.
  if (before._count.products > 0) return { error: "تیمی این ایشو را برداشته است؛ به‌جای حذف، غیرفعالش کن." };
  await prisma.osIssue.delete({ where: { id } });
  await audit(admin.id, "os_issue.delete", id, { before: { title: before.title, url: before.url } });
  revalidateIssuePages();
  return { ok: true };
}
