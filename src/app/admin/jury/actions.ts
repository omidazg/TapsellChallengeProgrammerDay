"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setSetting } from "@/lib/admin";
import { AWARD_PICK_KEYS } from "@/lib/scoring";
import { invalidate } from "@/lib/ttl-cache";

export type JuryActionState = { error?: string; ok?: boolean };

/** فیلد خالی یعنی «هنوز نمره نداده» (null)؛ وگرنه عدد صحیح ۰..۱۰ */
const juryAnswer = z.preprocess(
  (v) => (v === null || v === undefined || String(v).trim() === "" ? null : v),
  z.coerce
    .number({ error: "نمره باید عدد باشد" })
    .int("نمره باید عدد صحیح باشد")
    .min(0, "نمره باید بین ۰ تا ۱۰ باشد")
    .max(10, "نمره باید بین ۰ تا ۱۰ باشد")
    .nullable()
);

const scoreSchema = z.object({
  productId: z.string().min(1),
  juryWorks: juryAnswer,
  juryValue: juryAnswer,
  juryPitch: juryAnswer,
});

/** صفحه‌هایی که امتیاز یا جوایز را نشان می‌دهند */
function revalidateScorePages() {
  revalidatePath("/admin/jury");
  revalidatePath("/admin/settlement");
  revalidatePath("/leaderboard");
  revalidatePath("/results");
  revalidatePath("/hall");
}

/** ثبت نمرهٔ سه پرسش داوری انسانی (هر کدام ۰..۱۰) برای یک محصول */
export async function saveJuryScoreAction(prevState: JuryActionState, formData: FormData): Promise<JuryActionState> {
  const admin = await requireAdmin();
  const parsed = scoreSchema.safeParse({
    productId: formData.get("productId"),
    juryWorks: formData.get("juryWorks"),
    juryValue: formData.get("juryValue"),
    juryPitch: formData.get("juryPitch"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "نمره باید بین ۰ تا ۱۰ باشد" };
  const { productId, juryWorks, juryValue, juryPitch } = parsed.data;

  const before = await prisma.product.findUnique({
    where: { id: productId },
    select: { juryWorks: true, juryValue: true, juryPitch: true },
  });
  if (!before) return { error: "محصول پیدا نشد" };
  const after = { juryWorks, juryValue, juryPitch };
  await prisma.product.update({ where: { id: productId }, data: after });
  await audit(admin.id, "jury.score", productId, { before, after });
  // کش امتیازها (computeScoresCached) پاک شود تا جدول‌ها نمرهٔ تازه را نشان دهند
  invalidate("scores:");
  revalidateScorePages();
  return { ok: true };
}

const pickSchema = z.object({
  award: z.enum(["ai", "live"]),
  teamId: z.string().max(64).default(""),
});

/** انتخاب داوران برای جوایز «برترین کاربرد هوش مصنوعی» و «بهترین محصول لایو» (تیم خالی = انتخاب‌نشده) */
export async function saveAwardPickAction(prevState: JuryActionState, formData: FormData): Promise<JuryActionState> {
  const admin = await requireAdmin();
  const parsed = pickSchema.safeParse({ award: formData.get("award"), teamId: formData.get("teamId") ?? "" });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };
  const { award, teamId } = parsed.data;

  if (teamId) {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { product: { select: { submittedAt: true } } } });
    if (!team) return { error: "تیم پیدا نشد" };
    if (!team.product?.submittedAt) return { error: "این تیم محصول ثبت‌شده ندارد" };
  }

  const key = AWARD_PICK_KEYS[award];
  const prev = await prisma.setting.findUnique({ where: { key } });
  await setSetting(key, teamId);
  await audit(admin.id, "jury.award_pick", award, { before: prev?.value || null, after: teamId || null });
  invalidate("scores:");
  revalidateScorePages();
  return { ok: true };
}
