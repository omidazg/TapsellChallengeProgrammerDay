"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPhase, getSettingInt } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { askText } from "@/lib/ai";
import { validateInvestment, investedByUserOnIdea } from "@/lib/invest";
import { lowestRaisedIdeaId } from "@/lib/idea";

export type InvestActionState = { error?: string; ok?: boolean };
export type ChatActionState = { error?: string; ok?: boolean; aiUnavailable?: boolean };

/** سرمایه‌گذاری روی یک ایده در دور بذر */
export async function investAction(ideaId: string, amount: number): Promise<InvestActionState> {
  const user = await requireUser();
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی" };

  const { phase } = await getPhase();
  if (phase !== "SEED_ROUND") return { error: "سرمایه‌گذاری فقط در «دور سرمایه‌گذاری» ممکن است" };

  const amt = Math.round(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) return { error: "مبلغ سرمایه‌گذاری نامعتبر است" };

  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea || !idea.submittedAt) return { error: "این ایده یافت نشد" };

  const maxPerTarget = await getSettingInt("max_per_target", DEFAULTS.maxPerTarget);
  const alreadyOnTarget = await investedByUserOnIdea(user.id, ideaId);

  try {
    await prisma.$transaction(async (tx) => {
      const freshUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const validation = validateInvestment({
        amount: amt,
        alreadyOnTarget,
        walletLeft: freshUser.seedWallet,
        maxPerTarget,
        isOwnTeam: idea.teamId === user.teamId,
      });
      if (!validation.ok) throw new Error(validation.error);

      const investment = await tx.investment.create({
        data: {
          ideaId,
          userId: user.id,
          amount: amt,
          selfFunded: idea.teamId === user.teamId,
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { seedWallet: { decrement: amt } } });
      await tx.team.update({ where: { id: idea.teamId }, data: { treasury: { increment: amt } } });
      await tx.ledgerEntry.create({
        data: {
          userId: user.id,
          teamId: idea.teamId,
          wallet: "SEED",
          delta: -amt,
          reason: "INVEST",
          refId: investment.id,
        },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "خطا در ثبت سرمایه‌گذاری" };
  }

  revalidatePath(`/invest/${ideaId}`);
  revalidatePath("/invest");
  return { ok: true };
}

/** استفادهٔ کاربر با قدرت «فرشته»: ۲۰ سکهٔ بذر اضافه، فقط روی کم‌سرمایه‌ترین ایده */
export async function angelPowerAction(ideaId: string): Promise<InvestActionState> {
  const user = await requireUser();
  if (user.power !== "ANGEL") return { error: "این قدرت متعلق به تو نیست" };
  if (user.powerUsed) return { error: "قدرت فرشته قبلاً استفاده شده است" };

  const { phase } = await getPhase();
  if (phase !== "SEED_ROUND") return { error: "این قدرت فقط در «دور سرمایه‌گذاری» فعال است" };

  const lowestId = await lowestRaisedIdeaId(user.teamId);
  if (!lowestId || lowestId !== ideaId) {
    return { error: "قدرت فرشته فقط روی کم‌سرمایه‌ترین ایده کار می‌کند" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { seedWallet: { increment: 20 }, powerUsed: true } });
    await tx.ledgerEntry.create({
      data: { userId: user.id, wallet: "SEED", delta: 20, reason: "ADMIN", refId: ideaId },
    });
  });

  revalidatePath(`/invest/${ideaId}`);
  return { ok: true };
}

/** استفادهٔ کاربر با قدرت «خبرچین»: فهرست سرمایه‌گذاران را زودتر می‌بیند */
export async function insiderRevealAction(): Promise<InvestActionState> {
  const user = await requireUser();
  if (user.power !== "INSIDER") return { error: "این قدرت متعلق به تو نیست" };
  if (user.powerUsed) return { ok: true };

  await prisma.user.update({ where: { id: user.id }, data: { powerUsed: true } });
  revalidatePath("/invest");
  return { ok: true };
}

const questionSchema = z.string().trim().min(3, "سؤال را کامل‌تر بنویس").max(300, "سؤال خیلی طولانی است");

/** پرسش‌وپاسخ بررسی دقیق: فقط بر اساس متن ایده پاسخ می‌دهد */
export async function dueDiligenceAction(ideaId: string, question: string): Promise<ChatActionState> {
  const user = await requireUser();
  const parsed = questionSchema.safeParse(question);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "سؤال نامعتبر است" };

  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea) return { error: "این ایده یافت نشد" };

  const system = `تو دستیار بررسی دقیق (Due Diligence) یک سرمایه‌گذار هستی. فقط و فقط بر اساس متن معرفی ایدهٔ زیر پاسخ بده و چیزی از خودت اضافه نکن یا حدس نزن.
اگر پاسخ سؤال در متن نیست، دقیقاً همین جمله را بگو: «در متن معرفی ایده به این موضوع اشاره نشده است»

متن معرفی ایده:
عنوان: ${idea.title}
یک‌خطی: ${idea.oneLiner}
مسئله: ${idea.problem}
مخاطب: ${idea.audience}
برنامهٔ ساخت ۴۸ ساعته: ${idea.buildPlan}
سقف سرمایه: ${idea.fundingCap} سکه
سهم سود سرمایه‌گذار: ${idea.revenueShare}٪`;

  const answer = await askText(system, parsed.data, 400);
  if (!answer) return { aiUnavailable: true };

  await prisma.dueDiligenceMessage.create({
    data: { ideaId, userId: user.id, question: parsed.data, answer },
  });

  revalidatePath(`/invest/${ideaId}`);
  return { ok: true };
}
