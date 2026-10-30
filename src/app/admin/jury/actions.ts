"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireJudge } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { saveJuryScore } from "@/lib/jury";

export type JuryActionState = { error?: string; ok?: boolean };

/** صفحه‌هایی که نمرهٔ داوری یا نتیجهٔ آن را نشان می‌دهند */
function revalidateScorePages() {
  revalidatePath("/admin/jury");
  revalidatePath("/admin/settlement");
  revalidatePath("/leaderboard");
  revalidatePath("/results");
  revalidatePath("/hall");
}

/** ثبت نمرهٔ مستقل همین داور برای یک محصول: هر معیار ۰..۱۰ و یک یادداشت */
export async function saveJuryScoreAction(prevState: JuryActionState, formData: FormData): Promise<JuryActionState> {
  const judge = await requireJudge();
  const productId = String(formData.get("productId") ?? "");
  const scores: Record<string, unknown> = {};
  for (const [name, value] of formData) {
    if (name.startsWith("score:")) scores[name.slice("score:".length)] = String(value).trim();
  }
  const note = String(formData.get("note") ?? "");

  const before = await prisma.juryScore.findUnique({
    where: { productId_judgeId: { productId, judgeId: judge.id } },
    select: { scores: true, note: true },
  });
  const res = await saveJuryScore(judge.id, productId, { scores, note });
  if (res.error) return { error: res.error };
  await audit(judge.id, "jury.score", productId, { before, after: { scores, note } });
  revalidateScorePages();
  return { ok: true };
}
