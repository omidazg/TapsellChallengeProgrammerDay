"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { teamManageError } from "@/lib/team-access";
import { getPhase } from "@/lib/phase";
import { runAnalyst } from "@/lib/analyst";
import { imageUrlError } from "@/lib/product-utils";
import { AI_SUBMIT_COOLDOWN_MS, aiEvalCapMessage, aiSubmitCooldownMessage, runCappedAiEval } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";

/**
 * `values`: مقادیر ارسالی فرم در صورت خطا، تا ری‌ست خودکار فرم (React 19) نوشته‌های کاربر را پاک نکند.
 * `notice`: پیام اطلاع‌رسانی کنار ذخیرهٔ موفق (مثلاً پرشدن سقف تحلیل هوش مصنوعی).
 */
export type IdeaActionState = { error?: string; ok?: boolean; values?: Record<string, string>; notice?: string };

/** حداکثر طول فیلدهای متنی بلند ایده (هم در فرم و هم در سرور) */
const LONG_TEXT_MAX = 2000;

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
    // همان قاعدهٔ اعتبارسنجی فوری فرم (product-utils): آپلود محلی یا https روی میزبان‌های مجاز
    .superRefine((v, ctx) => {
      const err = imageUrlError(v);
      if (err) ctx.addIssue({ code: "custom", message: `تصویر جلد: ${err}` });
    }),
});

/** پیش‌نویس فقط عنوان لازم دارد؛ بقیهٔ فیلدها می‌توانند فعلاً خالی بمانند */
const draftSchema = ideaSchema.extend({
  oneLiner: z.string().trim().max(120, "یک‌خطی باید حداکثر ۱۲۰ نویسه باشد"),
  problem: z.string().trim().max(LONG_TEXT_MAX, "توضیح مسئله خیلی طولانی است"),
  audience: z.string().trim().max(LONG_TEXT_MAX, "توضیح مخاطب خیلی طولانی است"),
  buildPlan: z.string().trim().max(LONG_TEXT_MAX, "برنامهٔ ساخت خیلی طولانی است"),
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
  const accessError = await teamManageError(user);
  if (accessError) return { error: accessError };

  const values = Object.fromEntries(
    ["title", "oneLiner", "problem", "audience", "buildPlan"].map((k) => [k, String(formData.get(k) ?? "")])
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

  const parsed = (intent === "submit" ? ideaSchema : draftSchema).safeParse({
    title: formData.get("title"),
    oneLiner: formData.get("oneLiner"),
    problem: formData.get("problem"),
    audience: formData.get("audience"),
    buildPlan: formData.get("buildPlan"),
    coverUrl: formData.get("coverUrl") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است", values };
  }

  const data = parsed.data;

  // فاصلهٔ حداقل بین دو ثبت نهایی هر تیم: چرخهٔ «ویرایش ← ثبت» پشت‌سرهم هزینهٔ هوش مصنوعی می‌سازد.
  if (intent === "submit") {
    const cooldown = rateLimit("idea-submit", user.teamId, { limit: 1, windowMs: AI_SUBMIT_COOLDOWN_MS });
    if (!cooldown.ok) return { error: aiSubmitCooldownMessage(cooldown.retryAfterSec), values };
  }

  const idea = await prisma.idea.upsert({
    where: { teamId: user.teamId },
    update: {
      title: data.title,
      oneLiner: data.oneLiner,
      problem: data.problem,
      audience: data.audience,
      buildPlan: data.buildPlan,
      coverUrl: data.coverUrl ?? "",
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
      // ستون‌های قدیمی (هدف و سهم پیش از بازطراحی)؛ NOT NULL هستند و دیگر استفاده نمی‌شوند.
      fundingCap: 0,
      revenueShare: 0,
      ...(intent === "submit" ? { submittedAt: new Date() } : {}),
    },
  });

  let notice: string | undefined;
  if (intent === "submit") {
    // تحلیل‌گر هرگز نباید ثبت ایده را خراب کند (نبود کلید یا خطای شبکه).
    // حداکثر AI_EVAL_CAP_PER_PHASE تحلیل واقعی برای هر ایده در هر فاز؛ پس از آن نمرهٔ قبلی می‌ماند.
    try {
      const { phase } = await getPhase();
      const res = await runCappedAiEval({
        kind: "analyst",
        refId: idea.id,
        phase,
        cacheKey: `ai:analyst:${idea.id}`, // همان کلید کش lib/analyst.ts
        run: () => runAnalyst(idea.id),
      });
      if (!res.ran) notice = aiEvalCapMessage("analyst");
    } catch (e) {
      console.error("runAnalyst failed after submit", e);
    }
  }

  revalidatePath("/idea");
  revalidatePath("/invest");
  return notice ? { ok: true, notice } : { ok: true };
}

/** بازکردن قفل ایده برای ویرایش دوباره (پاک‌کردن submittedAt) */
export async function unsubmitIdeaAction(): Promise<IdeaActionState> {
  const user = await requireUser();
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی" };
  const accessError = await teamManageError(user);
  if (accessError) return { error: accessError };

  const phaseError = await assertIdeationEditable();
  if (phaseError) return { error: phaseError };

  const idea = await prisma.idea.findUnique({ where: { teamId: user.teamId } });
  if (!idea) return { error: "هنوز ایده‌ای ثبت نکرده‌ای" };

  await prisma.idea.update({ where: { id: idea.id }, data: { submittedAt: null } });
  revalidatePath("/idea");
  revalidatePath("/invest");
  return { ok: true };
}
