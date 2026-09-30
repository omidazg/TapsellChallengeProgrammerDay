"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { teamManageError } from "@/lib/leader";
import { getPhase } from "@/lib/phase";
import { runAnalyst } from "@/lib/analyst";
import { isNextImageHost } from "@/lib/idea";
import { isValidUploadName, UPLOAD_URL_PREFIX } from "@/lib/uploads";

/** `values`: مقادیر ارسالی فرم در صورت خطا، تا ری‌ست خودکار فرم (React 19) نوشته‌های کاربر را پاک نکند */
export type IdeaActionState = { error?: string; ok?: boolean; values?: Record<string, string> };

/** حداکثر طول فیلدهای متنی بلند ایده (هم در فرم و هم در سرور) */
const LONG_TEXT_MAX = 2000;

/**
 * نشانی تصویر باید یا یک فایل آپلودشدهٔ محلی (`/uploads/<hash>.webp`) یا یک
 * نشانی https روی یکی از میزبان‌های مجاز در next.config.ts باشد؛ هیچ میزبان
 * دلخواه دیگری پذیرفته نمی‌شود (جلوگیری از تصاویر ردیاب/میزبان‌های ناشناس).
 */
function isAllowedImageUrl(v: string): boolean {
  if (v === "") return true;
  if (v.startsWith(UPLOAD_URL_PREFIX)) return isValidUploadName(v.slice(UPLOAD_URL_PREFIX.length));
  return isNextImageHost(v);
}

const ideaSchema = z.object({
  title: z.string().trim().min(1, "عنوان را بنویس").max(80, "عنوان خیلی طولانی است"),
  oneLiner: z.string().trim().min(1, "یک‌خطی را بنویس").max(120, "یک‌خطی باید حداکثر ۱۲۰ نویسه باشد"),
  problem: z.string().trim().min(1, "مسئله را توضیح بده").max(LONG_TEXT_MAX, "توضیح مسئله خیلی طولانی است"),
  audience: z.string().trim().min(1, "مخاطب را مشخص کن").max(LONG_TEXT_MAX, "توضیح مخاطب خیلی طولانی است"),
  buildPlan: z.string().trim().min(1, "برنامهٔ ساخت ۴۸ ساعته را بنویس").max(LONG_TEXT_MAX, "برنامهٔ ساخت خیلی طولانی است"),
  coverUrl: z
    .string()
    .trim()
    .max(500, "نشانی تصویر خیلی طولانی است")
    .optional()
    .default("")
    .refine(isAllowedImageUrl, "نشانی تصویر مجاز نیست؛ از دکمهٔ آپلود استفاده کن یا نشانی یکی از میزبان‌های مجاز را بده"),
  fundingCap: z.coerce.number().int().min(50, "هدف جذب سرمایه حداقل ۵۰ است").max(600, "هدف جذب سرمایه حداکثر ۶۰۰ است"),
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
  const leaderError = await teamManageError(user);
  if (leaderError) return { error: leaderError };

  const values = Object.fromEntries(
    ["title", "oneLiner", "problem", "audience", "buildPlan", "fundingCap"].map((k) => [k, String(formData.get(k) ?? "")])
  );

  const phaseError = await assertIdeationEditable();
  if (phaseError) return { error: phaseError, values };

  const intent = String(formData.get("intent") ?? "draft");

  // ایدهٔ ثبت‌نهایی‌شده فقط پس از «ویرایش» (باز کردن قفل) با پیش‌نویس عوض می‌شود؛
  // وگرنه یک تب قدیمی می‌تواند محتوا را بی‌صدا و بدون تحلیل دوباره تغییر دهد.
  if (intent !== "submit") {
    const existing = await prisma.idea.findUnique({ where: { teamId: user.teamId }, select: { submittedAt: true } });
    if (existing?.submittedAt) {
      return { error: "ایده ثبت نهایی شده است؛ برای تغییر، صفحه را تازه کن و ابتدا «ویرایش» را بزن", values };
    }
  }

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
    return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است", values };
  }

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
    // تحلیل‌گر هرگز نباید ثبت ایده را خراب کند (نبود کلید یا خطای شبکه).
    try {
      await runAnalyst(idea.id);
    } catch (e) {
      console.error("runAnalyst failed after submit", e);
    }
  }

  revalidatePath("/idea");
  revalidatePath("/invest");
  return { ok: true };
}

/** بازکردن قفل ایده برای ویرایش دوباره (پاک‌کردن submittedAt) */
export async function unsubmitIdeaAction(): Promise<IdeaActionState> {
  const user = await requireUser();
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی" };
  const leaderError = await teamManageError(user);
  if (leaderError) return { error: leaderError };

  const phaseError = await assertIdeationEditable();
  if (phaseError) return { error: phaseError };

  const idea = await prisma.idea.findUnique({ where: { teamId: user.teamId } });
  if (!idea) return { error: "هنوز ایده‌ای ثبت نکرده‌ای" };

  await prisma.idea.update({ where: { id: idea.id }, data: { submittedAt: null } });
  revalidatePath("/idea");
  revalidatePath("/invest");
  return { ok: true };
}
