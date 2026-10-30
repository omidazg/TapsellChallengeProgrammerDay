/**
 * امتیازهایی که به شرکت‌کننده نشان داده می‌شود؛ تک‌منبع جدول امتیازات، نتایج، گزارش تیم و نمای سالن.
 *
 * تا وقتی نتایج اعلام نشده فقط هوش مصنوعی و بازار زنده دیده می‌شوند. ردیف‌های TeamScore نمرهٔ داوری دارند،
 * پس حتی بعد از تسویه هم نباید پیش از اعلام نتایج خوانده شوند.
 */
import { computeScores, computeScoresCached } from "./scoring";
import { getSettledAt, loadSettledOutput } from "./settlement";
import { cached } from "./ttl-cache";
import type { ScoreOutput } from "./economy/types";

/** پیشوند scores: تا invalidate("scores:") این کش را هم پاک کند. */
const REVEALED_CACHE_KEY = "scores:revealed";
const REVEALED_CACHE_TTL_MS = 15_000;

export type DisplayedScores = {
  output: ScoreOutput;
  /** زمان ثبت نهایی؛ فقط وقتی نتایج اعلام شده معنا دارد. */
  settledAt: Date | null;
};

/**
 * revealJury=false: نمای زنده بدون نمرهٔ داوری.
 * revealJury=true: نتیجهٔ ثبت‌شده، و تا پیش از ثبت نهایی محاسبهٔ زنده با نمرهٔ داوری.
 */
export async function scoresForDisplay(revealJury: boolean): Promise<DisplayedScores> {
  if (!revealJury) return { output: await computeScoresCached(), settledAt: null };
  const settledAt = await getSettledAt();
  const output = settledAt
    ? await loadSettledOutput()
    : await cached(REVEALED_CACHE_KEY, REVEALED_CACHE_TTL_MS, () => computeScores({ includeJury: true }));
  return { output, settledAt };
}
