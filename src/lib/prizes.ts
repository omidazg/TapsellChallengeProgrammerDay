/**
 * جوایز مسابقه: هر جایزه مبلغ ثابت دارد و در پنل ادمین تعریف می‌شود (مدل Prize).
 * هر محور یک جایزهٔ نفر اول دارد؛ جوایز ویژه را کمیته انتخاب می‌کند.
 *
 * این ماژول بدون وابستگی به دیتابیس است (در کامپوننت‌های کلاینت هم استفاده می‌شود).
 */
import type { ScoreOutput, TeamResult } from "./economy/types";
import { entryKey } from "./economy/types";

export type PrizeRow = {
  id: string;
  trackId: string;
  category: string;
  kind: string; // RANK | SPECIAL
  rank: number;
  label: string;
  emoji: string;
  amountToman: number | null;
  winnerProductId: string | null;
  order: number;
};

/** جوایز پیش‌فرض: نفر اول هر محور (محور عمومی دو دستهٔ فنی و غیرفنی دارد). */
export const DEFAULT_PRIZES: Omit<PrizeRow, "id" | "winnerProductId" | "amountToman">[] = [
  { trackId: "general", category: "TECH", kind: "RANK", rank: 1, label: "نفر اول ساخت محصول (فنی)", emoji: "🏆", order: 1 },
  { trackId: "general", category: "NON_TECH", kind: "RANK", rank: 1, label: "نفر اول ساخت محصول (غیرفنی)", emoji: "🏆", order: 2 },
  { trackId: "content", category: "", kind: "RANK", rank: 1, label: "نفر اول تولید محتوا", emoji: "🎬", order: 3 },
  { trackId: "os", category: "", kind: "RANK", rank: 1, label: "نفر اول راهکار OS", emoji: "🧩", order: 4 },
];

/** نمایش مبلغ جایزه؛ مبلغ نهایی‌نشده «به‌زودی اعلام می‌شود». */
export function formatPrizeAmount(amountToman: number | null): string {
  if (amountToman == null) return "به‌زودی اعلام می‌شود";
  return `${amountToman.toLocaleString("fa-IR")} تومان`;
}

export type Award = {
  prizeId: string;
  label: string;
  emoji: string;
  kind: string;
  rank: number;
  trackId: string;
  category: string;
  amountToman: number | null;
  teamId: string;
  teamName: string;
  productId: string | null;
  productName: string;
  /** امتیاز کل برنده */
  value: number;
};

export type AwardExtra = {
  prizes: PrizeRow[];
  teamNames: Map<string, string>;
  /** اگر تعداد ثبت‌های یک جایزه کمتر از این باشد، برنده باید حداقل نمرهٔ داوری را داشته باشد. */
  minEntries: number;
  minJury: number;
};

/**
 * محاسبهٔ برندگان. هر ثبت (محصول) حداکثر یک جایزهٔ رتبه و یک جایزهٔ ویژه می‌برد.
 * جایزهٔ رتبه خودکار از رتبهٔ محور می‌آید (با فیلتر دسته)؛ ثبت بدون عضو یا بدون محصول و امتیاز صفر
 * جایزه نمی‌برد. جایزهٔ ویژه‌ای که برنده‌اش انتخاب نشده یا ثبتش قبلاً جایزهٔ ویژه برده اهدا نمی‌شود.
 */
export function computeAwards(output: ScoreOutput, extra: AwardExtra): Award[] {
  const awards: Award[] = [];
  const rankWinners = new Set<string>();
  const specialWinners = new Set<string>();

  const give = (prize: PrizeRow, t: TeamResult) => {
    awards.push({
      prizeId: prize.id,
      label: prize.label,
      emoji: prize.emoji,
      kind: prize.kind,
      rank: prize.rank,
      trackId: prize.trackId,
      category: prize.category,
      amountToman: prize.amountToman,
      teamId: t.teamId,
      teamName: extra.teamNames.get(t.teamId) ?? "",
      productId: t.productId,
      productName: t.productName,
      value: t.total,
    });
  };

  const eligible = (t: TeamResult) => t.memberCount > 0 && !!t.productId && t.total > 0;
  const ordered = [...extra.prizes].sort((a, b) => a.rank - b.rank || a.order - b.order);

  for (const prize of ordered) {
    if (prize.kind === "SPECIAL") {
      const t = output.teams.find((e) => e.productId && e.productId === prize.winnerProductId);
      if (t && eligible(t) && !specialWinners.has(entryKey(t))) {
        give(prize, t);
        specialWinners.add(entryKey(t));
      }
      continue;
    }

    // output.teams به ترتیب رتبه است، پس فیلترشده هم به ترتیب رتبهٔ محور می‌ماند.
    const pool = output.teams.filter((t) => t.trackId === prize.trackId && (!prize.category || t.category === prize.category));
    const candidates = pool.filter((t) => eligible(t) && !rankWinners.has(entryKey(t)));
    // فقط ثبت‌های دارای محصول رقیب واقعی‌اند؛ تیمی که فقط ایده دارد محور را از کم‌جمعیت بودن درنمی‌آورد.
    const thin = pool.filter((t) => t.productId).length < extra.minEntries;
    const winner = candidates.find((t) => !thin || (t.juryRaw ?? 0) >= extra.minJury);
    if (winner) {
      give(prize, winner);
      rankWinners.add(entryKey(winner));
    }
  }

  return awards;
}
