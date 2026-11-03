"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type LessonActionState = { error?: string; ok?: boolean };

const httpUrl = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "لینک خیلی بلند است")
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "لینک باید با http شروع شود");

const schema = z.object({
  id: z.string().default(""),
  title: z.string().trim().min(1, "عنوان درس را بنویس").max(200, "عنوان خیلی طولانی است"),
  instructor: z.string().trim().max(100, "نام مدرس خیلی طولانی است"),
  description: z.string().trim().max(4000, "توضیح خیلی طولانی است"),
  videoUrl: httpUrl(400),
  links: z
    .string()
    .trim()
    .max(4000, "لینک‌ها خیلی زیادند")
    .refine((v) => v.split("\n").every((l) => l.trim() === "" || /^https?:\/\//i.test(l.trim())), "هر خط لینک‌ها باید با http شروع شود"),
  order: z.coerce.number().int().min(0).max(999),
  published: z.boolean(),
});

function revalidateLessonPages() {
  revalidatePath("/admin/learn");
  revalidatePath("/learn");
}

/** افزودن یا ویرایش درس (شناسهٔ خالی یعنی درس تازه) */
export async function saveLessonAction(prevState: LessonActionState, formData: FormData): Promise<LessonActionState> {
  const admin = await requireAdmin();
  const parsed = schema.safeParse({
    id: formData.get("id") ?? "",
    title: formData.get("title") ?? "",
    instructor: formData.get("instructor") ?? "",
    description: formData.get("description") ?? "",
    videoUrl: formData.get("videoUrl") ?? "",
    links: formData.get("links") ?? "",
    order: formData.get("order") || 0,
    published: formData.get("published") === "1",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const { id, ...data } = parsed.data;

  if (id) {
    const before = await prisma.lesson.findUnique({ where: { id } });
    if (!before) return { error: "درس پیدا نشد" };
    await prisma.lesson.update({ where: { id }, data });
    await audit(admin.id, "lesson.update", id, { after: { title: data.title, videoUrl: data.videoUrl, published: data.published } });
  } else {
    const created = await prisma.lesson.create({ data });
    await audit(admin.id, "lesson.create", created.id, { after: { title: data.title, videoUrl: data.videoUrl } });
  }
  revalidateLessonPages();
  return { ok: true };
}

export async function deleteLessonAction(prevState: LessonActionState, formData: FormData): Promise<LessonActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const before = await prisma.lesson.findUnique({ where: { id } });
  if (!before) return { error: "درس پیدا نشد" };
  await prisma.lesson.delete({ where: { id } });
  await audit(admin.id, "lesson.delete", id, { before: { title: before.title, videoUrl: before.videoUrl } });
  revalidateLessonPages();
  return { ok: true };
}
