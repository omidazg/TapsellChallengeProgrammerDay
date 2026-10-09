/**
 * تسویهٔ نهایی بازی: امتیازهای سه‌معیاره محاسبه و در TeamScore ثبت می‌شوند.
 * قرارداد: settleGame باید idempotent باشد — فراخوانی دوباره چیزی را دوباره ثبت نمی‌کند.
 * (در اقتصاد ساده‌شده سود سهام و جریمه‌ای وجود ندارد؛ تسویه فقط امتیازها را تثبیت می‌کند.)
 */
import { prisma } from "./db";
import { computeScores } from "./scoring";
import { invalidate } from "./ttl-cache";
import type { ScoreOutput, TeamResult } from "./economy/types";

/** کلید Setting که زمان تسویه در آن ذخیره می‌شود (ISO). */
export const SETTLED_AT_KEY = "settled_at";

export type SettlementResult = {
  alreadySettled: boolean;
  teams: number;
  settledAt: Date;
};

/** زمان تسویهٔ نهایی؛ null یعنی هنوز تسویه نشده است. */
export async function getSettledAt(): Promise<Date | null> {
  const row = await prisma.setting.findUnique({ where: { key: SETTLED_AT_KEY } });
  if (!row?.value) return null;
  const d = new Date(row.value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** اجرای در جریان settleGame (single-flight در-فرآیندی) */
let settleInFlight: Promise<SettlementResult> | null = null;

/**
 * تسویهٔ نهایی. امتیازها با `computeScores()` محاسبه و سپس همهٔ نوشتن‌ها (TeamScore و کلید
 * settled_at) در یک تراکنش انجام می‌شود. درون همان تراکنش دوباره settled_at بررسی می‌شود
 * تا دو فراخوانی هم‌زمان دوبار ثبت نکنند.
 */
export function settleGame(): Promise<SettlementResult> {
  // single-flight در-فرآیندی: کلیک ادمین و پیشروی خودکار زمان‌بند به CLOSED ممکن است هم‌زمان برسند.
  if (settleInFlight) return settleInFlight;
  settleInFlight = settleGameOnce().finally(() => {
    settleInFlight = null;
  });
  return settleInFlight;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** نوشتن امتیاز همهٔ تیم‌ها در TeamScore و زمان تسویه (درون تراکنش). */
async function writeScores(tx: Tx, output: ScoreOutput, settledAt: Date) {
  for (const t of output.teams) {
    const data = {
      memberCount: t.memberCount,
      juryRaw: t.juryRaw,
      juryAdjusted: t.juryAdjusted,
      people: t.people,
      supporters: t.supporters,
      coinsReceived: t.coinsReceived,
      ai: t.ai,
      ptsJury: t.pts.jury,
      ptsPeople: t.pts.people,
      ptsAi: t.pts.ai,
      cheatPenalty: t.cheatPenalty,
      total: t.total,
      rank: t.rank ?? 0,
      computedAt: settledAt,
    };
    await tx.teamScore.upsert({
      where: { teamId: t.teamId },
      update: data,
      create: { teamId: t.teamId, ...data },
    });
  }
  // ردیف تیم‌هایی که دیگر در محاسبه نیستند (مثلاً ادغام‌شده) نباید در نتیجه بمانند.
  await tx.teamScore.deleteMany({ where: { teamId: { notIn: output.teams.map((t) => t.teamId) } } });

  await tx.setting.upsert({
    where: { key: SETTLED_AT_KEY },
    update: { value: settledAt.toISOString() },
    create: { key: SETTLED_AT_KEY, value: settledAt.toISOString() },
  });
}

async function settleGameOnce(): Promise<SettlementResult> {
  const existing = await getSettledAt();
  if (existing) {
    return { alreadySettled: true, teams: await prisma.teamScore.count(), settledAt: existing };
  }

  const output: ScoreOutput = await computeScores();
  const settledAt = new Date();

  const result = await prisma.$transaction<SettlementResult>(async (tx) => {
    const guard = await tx.setting.findUnique({ where: { key: SETTLED_AT_KEY } });
    if (guard?.value) {
      return { alreadySettled: true, teams: await tx.teamScore.count(), settledAt: new Date(guard.value) };
    }
    await writeScores(tx, output, settledAt);
    return { alreadySettled: false, teams: output.teams.length, settledAt };
  });

  // کش صفحات عمومی (جدول امتیازات، نتایج) باید پاک شود تا داده‌های قدیمی نمایش داده نشود.
  invalidate("scores:");
  return result;
}

/**
 * بازتسویه: پس از تسویه، اگر داوران نمرهٔ دیرهنگام ثبت کنند یا برگزارکننده کسر تقلب بدهد، امتیازها
 * دوباره محاسبه و جایگزین نتیجهٔ ثبت‌شده می‌شوند. تسویه اثر جانبی دیگری (پرداخت/سود) ندارد، پس امن است.
 */
export async function resettleGame(): Promise<SettlementResult> {
  if (settleInFlight) await settleInFlight.catch(() => {});
  const output: ScoreOutput = await computeScores();
  const settledAt = new Date();
  await prisma.$transaction(async (tx) => {
    await writeScores(tx, output, settledAt);
  });
  invalidate("scores:");
  return { alreadySettled: false, teams: output.teams.length, settledAt };
}

/**
 * بعد از تسویهٔ نهایی، نتیجه از جدول TeamScore خوانده می‌شود (نه بازمحاسبه)،
 * تا عددهای صفحه دقیقاً همانی باشد که ثبت شده است.
 */
export async function loadSettledOutput(): Promise<ScoreOutput> {
  const scores = await prisma.teamScore.findMany({ orderBy: { rank: "asc" } });
  const teams: TeamResult[] = scores.map((s) => ({
    teamId: s.teamId,
    memberCount: s.memberCount,
    juryRaw: s.juryRaw,
    juryAdjusted: s.juryAdjusted,
    people: s.people,
    supporters: s.supporters,
    coinsReceived: s.coinsReceived,
    ai: s.ai,
    cheatPenalty: s.cheatPenalty,
    pts: { jury: s.ptsJury, people: s.ptsPeople, ai: s.ptsAi },
    total: s.total,
    rank: s.rank,
  }));
  return { teams };
}
