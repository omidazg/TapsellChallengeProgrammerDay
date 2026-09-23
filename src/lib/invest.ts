import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { validateInvestment } from "./economy/engine";
import { DEFAULTS } from "./constants";
import { invalidate } from "./ttl-cache";
import { lowestRaisedIdeaId } from "./idea";

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

      // خودتأمینی ممنوع است — پیش از هر بررسی دیگری همین‌جا رد می‌شود تا به
      // ترتیب فراخوانی اعتبارسنجی موتور وابسته نباشد (موتور هم جداگانه همین را رد می‌کند).
      const isOwnTeam = idea.teamId === user.teamId;
      if (isOwnTeam) {
        return { ok: false, error: "نمی‌توانی روی ایدهٔ تیم خودت سرمایه‌گذاری کنی" };
      }

      const maxPerTarget = await settingInt(tx, "max_per_target", DEFAULTS.maxPerTarget);

      const mine = await tx.investment.aggregate({ where: { userId, ideaId }, _sum: { amount: true } });
      const alreadyOnTarget = mine._sum.amount ?? 0;

      const validation = validateInvestment({
        amount: amt,
        alreadyOnTarget,
        walletLeft: user.seedWallet,
        maxPerTarget,
        isOwnTeam,
      });
      if (!validation.ok) return { ok: false, error: validation.error };

      // «سقف سرمایه» دیگر سقف سخت نیست، فقط هدف جذب سرمایه است؛ جذب بیشتر از هدف مجاز است.
      const investment = await tx.investment.create({
        data: { ideaId: idea.id, userId: user.id, amount: amt, selfFunded: false },
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
      // خزانهٔ تیم برای هر سرمایه‌گذاری افزایش می‌یابد؛ سطر متناظر دفتر کل هم ساخته می‌شود
      // تا خزانه با دفتر کل بخواند.
      await tx.ledgerEntry.create({
        data: {
          teamId: idea.teamId,
          wallet: "TREASURY",
          delta: amt,
          reason: "INVEST",
          refId: investment.id,
        },
      });

      return { ok: true, investmentId: investment.id, selfFunded: false };
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

export type AngelInvestResult =
  | { ok: true; investmentId: string; ideaId: string }
  | { ok: false; error: string };

/**
 * هستهٔ قدرت «فرشته»: ۲۰ سکهٔ بذر از هیچ (نه از کیف کاربر) ساخته و در یک تراکنش
 * روی کم‌سرمایه‌ترین ایدهٔ ثبت‌شدهٔ یک تیم دیگر سرمایه‌گذاری می‌شود؛ سودش مال کاربر است.
 * کیف بذر کاربر دست‌نخورده می‌ماند: یک سطر SEED +۲۰ (POWER_ANGEL) و یک سطر SEED −۲۰ (INVEST)
 * برای شفافیت دفتر کل ثبت می‌شود، اما جمعشان صفر است.
 */
export async function angelInvestCore(db: PrismaClient, userId: string): Promise<AngelInvestResult> {
  // هدف (کم‌سرمایه‌ترین ایدهٔ یک تیم دیگر) بیرون از تراکنش پیدا می‌شود: lowestRaisedIdeaId
  // از کلاینت سراسری می‌خواند و نباید وسط یک تراکنش SQLite اجرا شود.
  const owner = await db.user.findUnique({ where: { id: userId }, select: { teamId: true } });
  if (!owner?.teamId) return { ok: false, error: "ابتدا باید عضو یک تیم باشی" };
  const ideaId = await lowestRaisedIdeaId(owner.teamId);
  if (!ideaId) return { ok: false, error: "ایدهٔ دیگری برای دریافت قدرت فرشته پیدا نشد" };

  try {
    return await db.$transaction<AngelInvestResult>(async (tx) => {
      // هر خطا throw می‌شود، نه return: return تراکنش را commit می‌کند و قدرت
      // «مصرف‌شده» می‌ماند بدون آنکه سرمایه‌گذاری‌ای ثبت شده باشد.
      const phaseRow = await tx.setting.findUnique({ where: { key: "phase" } });
      if ((phaseRow?.value ?? "REGISTRATION") !== "SEED_ROUND") {
        throw new AngelError("این قدرت فقط در «دور سرمایه‌گذاری» فعال است");
      }

      const idea = await tx.idea.findUnique({ where: { id: ideaId }, select: { id: true, teamId: true, submittedAt: true } });
      if (!idea || !idea.submittedAt || idea.teamId === owner.teamId) throw new AngelError("این ایده یافت نشد");

      // شرط قدرت/عدم‌استفاده اتمی با updateMany تا دوبار استفاده ممکن نباشد.
      const claimed = await tx.user.updateMany({
        where: { id: userId, power: "ANGEL", powerUsed: false },
        data: { powerUsed: true },
      });
      if (claimed.count === 0) throw new AngelError("قدرت فرشته قبلاً استفاده شده یا متعلق به تو نیست");

      const amount = DEFAULTS.angelBonus;
      const investment = await tx.investment.create({
        data: { ideaId: idea.id, userId, amount, selfFunded: false },
      });
      await tx.team.update({ where: { id: idea.teamId }, data: { treasury: { increment: amount } } });

      // سکه از هیچ ساخته می‌شود: یک سطر ورودی و یک سطر خروجی برای کیف بذر، که خالص اثرشان صفر است.
      await tx.ledgerEntry.create({
        data: { userId, wallet: "SEED", delta: amount, reason: "POWER_ANGEL", refId: investment.id },
      });
      await tx.ledgerEntry.create({
        data: { userId, teamId: idea.teamId, wallet: "SEED", delta: -amount, reason: "INVEST", refId: investment.id },
      });
      await tx.ledgerEntry.create({
        data: { teamId: idea.teamId, wallet: "TREASURY", delta: amount, reason: "INVEST", refId: investment.id },
      });

      return { ok: true, investmentId: investment.id, ideaId: idea.id };
    });
  } catch (e) {
    if (e instanceof AngelError) return { ok: false, error: e.message };
    console.error("angelInvestCore error", e);
    return { ok: false, error: "خطا در استفاده از قدرت فرشته" };
  } finally {
    invalidate("scores:");
  }
}

/** خطای قابل نمایش قدرت فرشته؛ throw می‌شود تا تراکنش rollback شود. */
class AngelError extends Error {}
