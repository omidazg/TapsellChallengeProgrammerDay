"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPhase } from "@/lib/phase";
import { runAnalyst } from "@/lib/analyst";

export type IdeaActionState = { error?: string; ok?: boolean };

const ideaSchema = z.object({
  title: z.string().trim().min(1, "عنوان را بنویس").max(80, "عنوان خیلی طولانی است"),
  oneLiner: z.string().trim().min(1, "یک‌خطی را بنویس").max(120, "یک‌خطی باید حداکثر ۱۲۰ نویسه باشد"),
  problem: z.string().trim().min(1, "مسئله را توضیح بده"),
  audience: z.string().trim().min(1, "مخاطب را مشخص کن"),
  buildPlan: z.string().trim().min(1, "برنامهٔ ساخت ۴۸ ساعته را بنویس"),
  coverUrl: z.string().trim().max(500).optional().default(""),
  fundingCap: z.coerce.number().int().min(50, "سقف سرمایه حداقل ۵۰ است").max(600, "سقف سرمایه حداکثر ۶۰۰ است"),
  revenueShare: z.coerce.number().int().min(20, "سهم سود حداقل ۲۰٪ است").max(60, "سهم سود حداکثر ۶۰٪ است"),
});

async function assertIdeationEditable() {
  const { phase } = await getPhase();
  if (phase !== "IDEATION") {
    return "اتاق ایده فقط در فاز «اتاق ایده» قابل ویرایش است";
  }
  return null;
}

/** ذخیرهٔ پیش‌نویس یا ثبت نهایی ایده (upsert بر اساس teamId) */
export async function saveIdeaAction(prevState: IdeaActionState, formData: FormData): Promise<IdeaActionState> {
  const user = await requireUser();
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی" };

  const phaseError = await assertIdeationEditable();
  if (phaseError) return { error: phaseError };

  const parsed = ideaSchema.safeParse({
    title: formData.get("title"),
    oneLiner: formData.get("oneLiner"),
    problem: formData.get("problem"),
    audience: formData.get("audience"),
    buildPlan: formData.get("buildPlan"),
    coverUrl: formData.get("coverUrl") ?? "",
    fundingCap: formData.get("fundingCap"),
    revenueShare: formData.get("revenueShare"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  }

  const intent = String(formData.get("intent") ?? "draft");
  const data = parsed.data;

  const idea = await prisma.idea.upsert({
    where: { teamId: user.teamId },
    update: {
      title: data.title,
      oneLiner: data.oneLiner,
      problem: data.problem,
      audience: data.audience,
      buildPlan: data.buildPlan,
      coverUrl: data.coverUrl ?? "",
      fundingCap: data.fundingCap,
      revenueShare: data.revenueShare,
      ...(intent === "submit" ? { submittedAt: new Date() } : {}),
    },
    create: {
      teamId: user.teamId,
      title: data.title,
      oneLiner: data.oneLiner,
      problem: data.problem,
      audience: data.audience,
      buildPlan: data.buildPlan,
      coverUrl: data.coverUrl ?? "",
      fundingCap: data.fundingCap,
      revenueShare: data.revenueShare,
      ...(intent === "submit" ? { submittedAt: new Date() } : {}),
    },
  });

  if (intent === "submit") {
    await runAnalyst(idea.id).catch(() => null);
  }

  revalidatePath("/idea");
  return { ok: true };
}

/** بازکردن قفل ایده برای ویرایش دوباره (پاک‌کردن submittedAt) */
export async function unsubmitIdeaAction(): Promise<IdeaActionState> {
  const user = await requireUser();
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی" };

  const phaseError = await assertIdeationEditable();
  if (phaseError) return { error: phaseError };

  const idea = await prisma.idea.findUnique({ where: { teamId: user.teamId } });
  if (!idea) return { error: "هنوز ایده‌ای ثبت نکرده‌ای" };

  await prisma.idea.update({ where: { id: idea.id }, data: { submittedAt: null } });
  revalidatePath("/idea");
  return { ok: true };
}
