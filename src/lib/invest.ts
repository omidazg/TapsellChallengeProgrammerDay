import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { validateInvestment } from "./economy/engine";
import { DEFAULTS } from "./constants";
import { invalidate } from "./ttl-cache";

export { validateInvestment };

/** جمع سرمایه‌گذاری‌شدهٔ یک کاربر روی یک ایدهٔ خاص */
export async function investedByUserOnIdea(userId: string, ideaId: string): Promise<number> {
  const agg = await prisma.investment.aggregate({
    where: { userId, ideaId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** جمع کل سرمایه‌گذاری‌شدهٔ یک کاربر (برای نمایش در هدر) */
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

/** خواندن یک تنظیم عددی از داخل همان تراکنش (تا با بقیهٔ خواندن‌ها هم‌زمان بماند) */
async function settingInt(tx: Prisma.TransactionClient, key: string, fallback: number): Promise<number> {
  const row = await tx.setting.findUnique({ where: { key } });
  const n = parseInt(row?.value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * هستهٔ سرمایه‌گذاری — بدون وابستگی به cookie/session تا هم از Server Action
 * و هم از اسکریپت‌های تست قابل فراخوانی باشد.
 *
 * همهٔ خواندن‌های حساس (کیف پول، سرمایهٔ قبلی، جذب‌شدهٔ ایده، فاز بازی) داخل
 * همان `$transaction` انجام می‌شوند تا شرایط رقابتی ایجاد نشود.
 */
export async function investCore(
  db: PrismaClient,
  userId: string,
  ideaId: string,
  amount: number
): Promise<InvestResult> {
  const amt = Math.round(Number(amount));
  if (!Number.isFinite(amt) || amt < 1) {
    return { ok: false, error: "مبلغ سرمایه‌گذاری نامعتبر است" };
  }

  try {
    return await db.$transaction<InvestResult>(async (tx) => {
      const phaseRow = await tx.setting.findUnique({ where: { key: "phase" } });
      if ((phaseRow?.value ?? "REGISTRATION") !== "SEED_ROUND") {
        return { ok: false, error: "سرمایه‌گذاری فقط در «دور سرمایه‌گذاری» ممکن است" };
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, teamId: true, seedWallet: true },
      });
      if (!user) return { ok: false, error: "کاربر یافت نشد" };
      if (!user.teamId) return { ok: false, error: "ابتدا باید عضو یک تیم باشی" };

      const idea = await tx.idea.findUnique({
        where: { id: ideaId },
        select: { id: true, teamId: true, fundingCap: true, submittedAt: true },
      });
      if (!idea || !idea.submittedAt) return { ok: false, error: "این ایده یافت نشد" };

      const maxPerTarget = await settingInt(tx, "max_per_target", DEFAULTS.maxPerTarget);

      const [mine, total] = await Promise.all([
        tx.investment.aggregate({ where: { userId, ideaId }, _sum: { amount: true } }),
        tx.investment.aggregate({ where: { ideaId }, _sum: { amount: true } }),
      ]);
      const alreadyOnTarget = mine._sum.amount ?? 0;
      const raised = total._sum.amount ?? 0;

      const selfFunded = idea.teamId === user.teamId;

      // سرمایه‌گذاری روی تیم خودی مجاز است (فقط با پرچم selfFunded ثبت می‌شود)،
      // پس isOwnTeam را به موتور می‌دهیم — validateInvestment آن را مسدود نمی‌کند.
      const validation = validateInvestment({
        amount: amt,
        alreadyOnTarget,
        walletLeft: user.seedWallet,
        maxPerTarget,
        isOwnTeam: selfFunded,
      });
      if (!validation.ok) return { ok: false, error: validation.error };

      if (raised + amt > idea.fundingCap) {
        return { ok: false, error: "سقف جذب سرمایهٔ این ایده پر شده است" };
      }

      const investment = await tx.investment.create({
        data: { ideaId: idea.id, userId: user.id, amount: amt, selfFunded },
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
      // خزانهٔ تیم برای هر سرمایه‌گذاری (خودی و خارجی) افزایش می‌یابد،
      // پس سطر متناظر دفتر کل هم برای هر دو ساخته می‌شود تا خزانه با دفتر کل بخواند.
      await tx.ledgerEntry.create({
        data: {
          teamId: idea.teamId,
          wallet: "TREASURY",
          delta: amt,
          reason: "INVEST",
          refId: investment.id,
        },
      });

      return { ok: true, investmentId: investment.id, selfFunded };
    });
  } catch (e) {
    console.error("investCore error", e);
    return { ok: false, error: "خطا در ثبت سرمایه‌گذاری" };
  } finally {
    // سرمایه‌گذاری موفق روی externalCapital/netSales و امتیاز تیم اثر می‌گذارد؛
    // با TTL کوتاه (۱۵ ثانیه) صرفاً اتکا به انقضا کافی است، اما invalidate فوری تازگی بهتری می‌دهد.
    invalidate("scores:");
  }
}
