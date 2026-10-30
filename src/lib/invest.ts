import type { PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { validateInvestment } from "./economy/engine";
import { invalidate } from "./ttl-cache";
import { reservedBuyCoins } from "./reservations";
import { moduleGate } from "./module-state";

export { validateInvestment };

/** جمع حمایت یک کاربر از یک ایدهٔ خاص */
export async function investedByUserOnIdea(userId: string, ideaId: string): Promise<number> {
  const agg = await prisma.investment.aggregate({
    where: { userId, ideaId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** جمع کل حمایت‌های یک کاربر از ایده‌ها */
export async function totalInvestedByUser(userId: string): Promise<number> {
  const agg = await prisma.investment.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export type InvestResult =
  | { ok: true; investmentId: string; selfFunded: boolean }
  | { ok: false; error: string };

/**
 * هستهٔ حمایت از یک ایده با سکه — بدون وابستگی به cookie/session تا هم از Server Action
 * و هم از اسکریپت‌های تست قابل فراخوانی باشد.
 *
 * قانون فقط یکی است: حمایت از ایدهٔ تیم خودت ممنوع است. سقفی روی مبلغ نیست؛ اثر هر نفر روی
 * امتیاز یک پروژه در موتور امتیاز (support_cap) محدود می‌شود. کاربر بدون تیم هم می‌تواند حمایت کند.
 * همهٔ خواندن‌های حساس (کیف، ایده) داخل همان `$transaction` انجام می‌شوند.
 */
export async function investCore(
  db: PrismaClient,
  userId: string,
  ideaId: string,
  amount: number
): Promise<InvestResult> {
  const amt = Math.round(Number(amount));
  if (!Number.isFinite(amt) || amt < 1) {
    return { ok: false, error: "مبلغ حمایت نامعتبر است" };
  }

  try {
    return await db.$transaction<InvestResult>(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, teamId: true, buyWallet: true },
      });
      if (!user) return { ok: false, error: "کاربر یافت نشد" };
      const gate = await moduleGate("invest", user.teamId);
      if (gate) return { ok: false, error: gate };

      const idea = await tx.idea.findUnique({
        where: { id: ideaId },
        select: { id: true, teamId: true, submittedAt: true },
      });
      if (!idea || !idea.submittedAt) return { ok: false, error: "این ایده یافت نشد" };

      const isOwnTeam = !!user.teamId && idea.teamId === user.teamId;
      const walletLeft = user.buyWallet - (await reservedBuyCoins(tx, userId));
      const validation = validateInvestment({ amount: amt, walletLeft, isOwnTeam });
      if (!validation.ok) return { ok: false, error: validation.error };

      const investment = await tx.investment.create({
        data: { ideaId: idea.id, userId: user.id, amount: amt, selfFunded: false },
      });
      // نگهبان: کسر فقط اگر موجودی هنوز کافی است (کیف هرگز منفی نمی‌شود).
      const charged = await tx.user.updateMany({
        where: { id: user.id, buyWallet: { gte: amt } },
        data: { buyWallet: { decrement: amt } },
      });
      if (charged.count === 0) throw new Error("موجودی در حین حمایت تغییر کرد");
      await tx.ledgerEntry.create({
        data: {
          userId: user.id,
          teamId: idea.teamId,
          wallet: "BUY",
          delta: -amt,
          reason: "INVEST",
          refId: investment.id,
        },
      });

      return { ok: true, investmentId: investment.id, selfFunded: false };
    });
  } catch (e) {
    console.error("investCore error", e);
    return { ok: false, error: "خطا در ثبت حمایت" };
  } finally {
    // حمایت روی امتیاز «حمایت مردمی» اثر می‌گذارد؛ کش امتیازها فوراً پاک می‌شود.
    invalidate("scores:");
  }
}

export type WithdrawResult = { ok: true; refunded: number } | { ok: false; error: string };

/** آیا این حمایت قابل پس‌گرفتن است؟ فقط حمایتی که پیش از آخرین ویرایش ایده ثبت شده. */
export function canWithdrawInvestment(createdAt: Date, ideaEditedAt: Date | null): boolean {
  return !!ideaEditedAt && createdAt.getTime() < ideaEditedAt.getTime();
}

/**
 * پس‌گرفتن حمایت از ایده‌ای که پس از حمایت ویرایش شده است. سکه کامل برمی‌گردد و حمایت از امتیاز کم می‌شود.
 * حمایت‌های بعد از آخرین ویرایش (که حامی ایدهٔ تازه را دیده) برگشت‌پذیر نیستند.
 */
export async function withdrawInvestment(db: PrismaClient, userId: string, ideaId: string): Promise<WithdrawResult> {
  try {
    return await db.$transaction<WithdrawResult>(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, teamId: true } });
      if (!user) return { ok: false, error: "کاربر یافت نشد" };
      const gate = await moduleGate("invest", user.teamId);
      if (gate) return { ok: false, error: gate };
      const idea = await tx.idea.findUnique({ where: { id: ideaId }, select: { id: true, teamId: true, editedAt: true } });
      if (!idea) return { ok: false, error: "این ایده یافت نشد" };

      const rows = await tx.investment.findMany({ where: { ideaId, userId } });
      const eligible = rows.filter((r) => canWithdrawInvestment(r.createdAt, idea.editedAt));
      if (eligible.length === 0) return { ok: false, error: "فقط حمایتی را می‌شود پس گرفت که پیش از ویرایش ایده ثبت شده باشد" };

      const refunded = eligible.reduce((a, r) => a + r.amount, 0);
      await tx.investment.deleteMany({ where: { id: { in: eligible.map((r) => r.id) } } });
      await tx.user.update({ where: { id: userId }, data: { buyWallet: { increment: refunded } } });
      await tx.ledgerEntry.create({
        data: { userId, teamId: idea.teamId, wallet: "BUY", delta: refunded, reason: "INVEST_WITHDRAW", refId: ideaId },
      });
      return { ok: true, refunded };
    });
  } catch (e) {
    console.error("withdrawInvestment error", e);
    return { ok: false, error: "خطا در پس‌گرفتن حمایت" };
  } finally {
    invalidate("scores:");
  }
}
