"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPhase } from "@/lib/phase";

export type SurveyActionState = { error?: string; ok?: boolean };

const ratingField = z.coerce.number().int().min(1, "بین ۱ تا ۵ انتخاب کن").max(5, "بین ۱ تا ۵ انتخاب کن");

const surveySchema = z.object({
  rating: ratingField,
  fun: ratingField,
  learned: ratingField,
  comment: z.string().trim().max(1000, "نظر حداکثر ۱۰۰۰ نویسه").optional().default(""),
});

async function assertOpen() {
  const { phase } = await getPhase();
  if (phase !== "AUCTION" && phase !== "CLOSED") {
    return "نظرسنجی فقط از فاز «حراج زنده» تا پایان بازی باز است.";
  }
  return null;
}

/** ثبت یا ویرایش پاسخ نظرسنجی (یک پاسخ به ازای هر کاربر، upsert بر اساس userId) */
export async function submitSurveyAction(prevState: SurveyActionState, formData: FormData): Promise<SurveyActionState> {
  const user = await requireUser();

  const gateError = await assertOpen();
  if (gateError) return { error: gateError };

  const parsed = surveySchema.safeParse({
    rating: formData.get("rating"),
    fun: formData.get("fun"),
    learned: formData.get("learned"),
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  }

  const data = parsed.data;
  await prisma.surveyResponse.upsert({
    where: { userId: user.id },
    update: { rating: data.rating, fun: data.fun, learned: data.learned, comment: data.comment },
    create: { userId: user.id, rating: data.rating, fun: data.fun, learned: data.learned, comment: data.comment },
  });

  revalidatePath("/survey");
  return { ok: true };
}
