/**
 * تسویهٔ نهایی بازی: امتیازهای سه‌معیاره محاسبه و در TeamScore ثبت می‌شوند.
 * قرارداد: settleGame باید idempotent باشد — فراخوانی دوباره چیزی را دوباره ثبت نمی‌کند،
 * با یک استثنا: اگر تسویه زودتر از «پایان بازی» (پیش از CLOSED) اجرا شده باشد، اولین تسویه پس از
 * رسیدن به CLOSED نتیجه را با همهٔ فعالیت‌ها تا آن لحظه بازمحاسبه و جایگزین می‌کند (تسویهٔ قطعی).
 * (در اقتصاد ساده‌شده سود سهام و جریمه‌ای وجود ندارد؛ تسویه فقط امتیازها را تثبیت می‌کند.)
 */
import { prisma } from "./db";
import { computeScores } from "./scoring";
import { invalidate } from "./ttl-cache";
import { entryKey, type MarketPoints, type ScoreOutput, type TeamResult } from "./economy/types";

/** کلید Setting که زمان تسویه در آن ذخیره می‌شود (ISO). */
export const SETTLED_AT_KEY = "settled_at";
/**
 * کلید Setting که می‌گوید تسویهٔ ثبت‌شده قطعی است ("1": در فاز CLOSED انجام شد) یا زودهنگام ("0").
 * نبودِ این کلید کنار settled_at (تسویه‌های پیش از این تغییر) قطعی فرض می‌شود.
 */
export const SETTLED_FINAL_KEY = "settled_final";

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

/** آیا تسویهٔ قطعی (در فاز CLOSED) انجام شده است؟ تسویهٔ زودهنگام قطعی نیست. */
export async function isFinalSettled(): Promise<boolean> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [SETTLED_AT_KEY, SETTLED_FINAL_KEY] } } });
  return settleStateOf(rows)?.final ?? false;
}

/** اجرای در جریان settleGame (single-flight در-فرآیندی) */
let settleInFlight: Promise<SettlementResult> | null = null;

/**
 * تسویهٔ نهایی. امتیازها با `computeScores()` محاسبه و سپس همهٔ نوشتن‌ها (TeamScore و کلیدهای
 * settled_at/settled_final) در یک تراکنش انجام می‌شود. درون همان تراکنش دوباره وضعیت تسویه بررسی
 * می‌شود تا دو فراخوانی هم‌زمان دوبار ثبت نکنند.
 *
 * - هنوز تسویه نشده: ثبت می‌شود (اگر فاز CLOSED نیست، «زودهنگام» علامت می‌خورد).
 * - تسویهٔ زودهنگام + فاز حالا CLOSED: بازمحاسبه و جایگزین می‌شود و قطعی علامت می‌خورد.
 * - در بقیهٔ حالت‌ها: alreadySettled (بدون نوشتن).
 */
export function settleGame(): Promise<SettlementResult> {
  // single-flight در-فرآیندی: کلیک ادمین و پیشروی خودکار زمان‌بند به CLOSED ممکن است هم‌زمان برسند.
  // فراخوانی‌ها پشت سر هم صف می‌شوند (نه اشتراک نتیجه): اگر یک تسویهٔ زودهنگام در جریان باشد و هم‌زمان
  // بازی به CLOSED برسد، فراخوانی دوم پس از اولی دوباره وضعیت را می‌بیند و تسویهٔ قطعی را انجام می‌دهد.
  const prev = settleInFlight;
  const run: Promise<SettlementResult> = (prev ? prev.then(noop, noop) : Promise.resolve())
    .then(() => settleGameOnce())
    .finally(() => {
      if (settleInFlight === run) settleInFlight = null;
    });
  settleInFlight = run;
  return run;
}

function noop() {}

function parseMarketDetail(raw: string): MarketPoints {
  const empty: MarketPoints = { support: 0, activeInstalls: 0, revenue: 0, rating: 0, comments: 0 };
  try {
    return { ...empty, ...JSON.parse(raw) };
  } catch {
    return empty;
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** نوشتن امتیاز همهٔ تیم‌ها در TeamScore و زمان تسویه (درون تراکنش). final=undefined وضعیت قطعی را دست نمی‌زند. */
async function writeScores(tx: Tx, output: ScoreOutput, settledAt: Date, final?: boolean) {
  for (const t of output.teams) {
    const data = {
      productId: t.productId,
      category: t.category,
      memberCount: t.memberCount,
      juryRaw: t.juryRaw,
      juryAdjusted: t.juryAdjusted,
      people: t.people,
      supporters: t.supporters,
      coinsReceived: t.coinsReceived,
      ai: t.ai,
      ptsJury: t.pts.jury,
      ptsMarket: t.pts.market,
      ptsAi: t.pts.ai,
      marketDetail: JSON.stringify(t.marketDetail),
      cheatPenalty: t.cheatPenalty,
      total: t.total,
      rank: t.rank ?? 0,
      overallRank: t.overallRank ?? 0,
      computedAt: settledAt,
    };
    await tx.teamScore.upsert({
      where: { teamId_trackId: { teamId: t.teamId, trackId: t.trackId } },
      update: data,
      create: { teamId: t.teamId, trackId: t.trackId, ...data },
    });
  }
  // ردیف ثبت‌هایی که دیگر در محاسبه نیستند (مثلاً محور مخفی یا تیم ادغام‌شده) نباید در نتیجه بمانند.
  const keep = new Set(output.teams.map(entryKey));
  const existingRows = await tx.teamScore.findMany({ select: { id: true, teamId: true, trackId: true } });
  const stale = existingRows.filter((r) => !keep.has(entryKey(r))).map((r) => r.id);
  if (stale.length > 0) await tx.teamScore.deleteMany({ where: { id: { in: stale } } });

  await tx.setting.upsert({
    where: { key: SETTLED_AT_KEY },
    update: { value: settledAt.toISOString() },
    create: { key: SETTLED_AT_KEY, value: settledAt.toISOString() },
  });
  if (final !== undefined) {
    const value = final ? "1" : "0";
    await tx.setting.upsert({ where: { key: SETTLED_FINAL_KEY }, update: { value }, create: { key: SETTLED_FINAL_KEY, value } });
  }
}

/** وضعیت تسویه از روی ردیف‌های Setting: null = تسویه نشده. */
function settleStateOf(rows: { key: string; value: string }[]): { settledAt: Date; final: boolean } | null {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const raw = map.get(SETTLED_AT_KEY);
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return { settledAt: d, final: map.get(SETTLED_FINAL_KEY) !== "0" };
}

const SETTLE_STATE_KEYS = [SETTLED_AT_KEY, SETTLED_FINAL_KEY, "phase"];

async function settleGameOnce(): Promise<SettlementResult> {
  const pre = await prisma.setting.findMany({ where: { key: { in: SETTLE_STATE_KEYS } } });
  const existing = settleStateOf(pre);
  const closedNow = pre.find((r) => r.key === "phase")?.value === "CLOSED";
  // تسویهٔ قطعی، یا تسویهٔ زودهنگامی که هنوز به پایان بازی نرسیده: کاری نیست.
  if (existing && (existing.final || !closedNow)) {
    return { alreadySettled: true, teams: await prisma.teamScore.count(), settledAt: existing.settledAt };
  }

  const output: ScoreOutput = await computeScores();
  const settledAt = new Date();

  const result = await prisma.$transaction<SettlementResult>(async (tx) => {
    const rows = await tx.setting.findMany({ where: { key: { in: SETTLE_STATE_KEYS } } });
    const guard = settleStateOf(rows);
    const closed = rows.find((r) => r.key === "phase")?.value === "CLOSED";
    if (guard && (guard.final || !closed)) {
      return { alreadySettled: true, teams: await tx.teamScore.count(), settledAt: guard.settledAt };
    }
    await writeScores(tx, output, settledAt, closed);
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
    // بازتسویه در فاز CLOSED همان تسویهٔ قطعی است؛ پیش از آن وضعیت زودهنگام دست نمی‌خورد.
    const phaseRow = await tx.setting.findUnique({ where: { key: "phase" } });
    await writeScores(tx, output, settledAt, phaseRow?.value === "CLOSED" ? true : undefined);
  });
  invalidate("scores:");
  return { alreadySettled: false, teams: output.teams.length, settledAt };
}

/**
 * بعد از تسویهٔ نهایی، نتیجه از جدول TeamScore خوانده می‌شود (نه بازمحاسبه)،
 * تا عددهای صفحه دقیقاً همانی باشد که ثبت شده است.
 */
export async function loadSettledOutput(): Promise<ScoreOutput> {
  const scores = await prisma.teamScore.findMany({ orderBy: { overallRank: "asc" }, include: { team: { select: { products: { select: { id: true, name: true } } } } } });
  const teams: TeamResult[] = scores.map((s) => ({
    teamId: s.teamId,
    trackId: s.trackId,
    category: s.category,
    productId: s.productId,
    productName: s.team.products.find((p) => p.id === s.productId)?.name ?? "",
    memberCount: s.memberCount,
    juryRaw: s.juryRaw,
    juryAdjusted: s.juryAdjusted,
    people: s.people,
    supporters: s.supporters,
    coinsReceived: s.coinsReceived,
    ai: s.ai,
    cheatPenalty: s.cheatPenalty,
    pts: { jury: s.ptsJury, market: s.ptsMarket, ai: s.ptsAi },
    marketDetail: parseMarketDetail(s.marketDetail),
    total: s.total,
    rank: s.rank,
    overallRank: s.overallRank,
  }));
  return { teams };
}
