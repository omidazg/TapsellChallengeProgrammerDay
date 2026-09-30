/**
 * قدرت «سپر»: بیمهٔ یک سرمایه‌گذاری.
 *
 * دارندهٔ سپر یک‌بار، فقط در «دور سرمایه‌گذاری» یا «ساخت محصول» (پیش از شروع روز بازار،
 * یعنی پیش از آنکه کسی فروش‌ها را بداند)، یکی از تیم‌هایی را که رویشان سرمایه‌گذاری کرده
 * انتخاب می‌کند. انتخاب برگشت‌ناپذیر است. در امتیازدهی فقط همان جفت (کاربر، تیم)
 * portfolioCredit = max(dividend, floor(invested × shieldFloor)) می‌گیرد؛ هیچ سکهٔ واقعی
 * جابه‌جا نمی‌شود (نگاه کنید computeDividends در ./economy/engine.ts).
 */
import { prisma } from "./db";
import { DEFAULTS } from "./constants";
import type { Phase } from "./phases";
import { invalidate } from "./ttl-cache";

/** فازهایی که انتخاب هدف سپر در آن‌ها مجاز است (پیش از روز بازار). */
export const SHIELD_PHASES: readonly Phase[] = ["SEED_ROUND", "BUILD"];

export function shieldPhaseAllowed(phase: string): boolean {
  return (SHIELD_PHASES as readonly string[]).includes(phase);
}

/** بیشترین اثر سپر روی یک سرمایه‌گذاری: نصف مبلغ (گرد به پایین). */
export function shieldMaxCredit(invested: number): number {
  return Math.floor(invested * DEFAULTS.shieldFloor);
}

export type ShieldCandidate = {
  teamId: string;
  teamName: string;
  ideaTitle: string;
  invested: number;
};

/**
 * سرمایه‌گذاری‌هایی که سپر می‌تواند رویشان بنشیند: فقط سرمایه‌گذاری غیر selfFunded
 * روی ایدهٔ تیم‌های دیگر، با جمع مبلغ مثبت (به‌ازای هر تیم یک سطر، مثل سطرهای سود).
 */
export async function shieldCandidates(userId: string): Promise<ShieldCandidate[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } });
  const investments = await prisma.investment.findMany({
    where: { userId, selfFunded: false },
    select: { amount: true, idea: { select: { teamId: true, title: true, team: { select: { name: true } } } } },
  });
  const byTeam = new Map<string, ShieldCandidate>();
  for (const inv of investments) {
    const teamId = inv.idea.teamId;
    if (user?.teamId && teamId === user.teamId) continue; // تیم خودت هرگز
    const cur = byTeam.get(teamId) ?? { teamId, teamName: inv.idea.team.name, ideaTitle: inv.idea.title, invested: 0 };
    cur.invested += inv.amount;
    byTeam.set(teamId, cur);
  }
  return [...byTeam.values()].filter((c) => c.invested > 0).sort((a, b) => b.invested - a.invested);
}

export type ShieldResult = { ok: true; teamId: string; invested: number } | { ok: false; error: string };

/**
 * هستهٔ انتخاب هدف سپر — بدون وابستگی به cookie/session تا هم از Server Action و هم از
 * اسکریپت‌های تست قابل فراخوانی باشد. همهٔ بررسی‌ها داخل یک تراکنش‌اند و ثبت نهایی با
 * `updateMany where powerUsed:false` اتمی است تا دو درخواست هم‌زمان دو هدف ثبت نکنند.
 */
export async function chooseShieldTarget(userId: string, teamId: string): Promise<ShieldResult> {
  if (!teamId) return { ok: false, error: "این سرمایه‌گذاری یافت نشد" };

  try {
    return await prisma.$transaction<ShieldResult>(async (tx) => {
      const phaseRow = await tx.setting.findUnique({ where: { key: "phase" } });
      if (!shieldPhaseAllowed(phaseRow?.value ?? "REGISTRATION")) {
        return { ok: false, error: "سپر را فقط در «دور سرمایه‌گذاری» یا «ساخت محصول» (پیش از روز بازار) می‌شود انتخاب کرد" };
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { power: true, powerUsed: true, shieldTeamId: true, teamId: true },
      });
      if (!user) return { ok: false, error: "کاربر یافت نشد" };
      if (user.power !== "SHIELD") return { ok: false, error: "این قدرت متعلق به تو نیست" };
      if (user.powerUsed || user.shieldTeamId) {
        return { ok: false, error: "سپر قبلاً انتخاب شده و دیگر قابل تغییر نیست" };
      }
      if (user.teamId && user.teamId === teamId) {
        return { ok: false, error: "سپر روی سرمایه‌گذاری در تیم خودت نمی‌نشیند" };
      }

      const agg = await tx.investment.aggregate({
        where: { userId, selfFunded: false, idea: { teamId } },
        _sum: { amount: true },
      });
      const invested = agg._sum.amount ?? 0;
      if (invested <= 0) return { ok: false, error: "روی این تیم سرمایه‌گذاری نکرده‌ای" };

      // ثبت اتمی و یک‌باره: فقط اگر هنوز استفاده نشده باشد
      const claimed = await tx.user.updateMany({
        where: { id: userId, power: "SHIELD", powerUsed: false, shieldTeamId: null },
        data: { powerUsed: true, shieldTeamId: teamId },
      });
      if (claimed.count === 0) return { ok: false, error: "سپر قبلاً انتخاب شده و دیگر قابل تغییر نیست" };

      return { ok: true, teamId, invested };
    });
  } catch (e) {
    console.error("chooseShieldTarget error", e);
    return { ok: false, error: "خطا در ثبت سپر" };
  } finally {
    // اعتبار پرتفوی تیم کاربر عوض می‌شود؛ کش امتیازها پاک شود.
    invalidate("scores:");
  }
}
