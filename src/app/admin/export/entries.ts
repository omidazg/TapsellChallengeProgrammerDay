import { prisma } from "@/lib/db";
import { computeScores } from "@/lib/scoring";
import { getSettledAt, loadSettledOutput } from "@/lib/settlement";
import { ENTRY_CATEGORY_LABEL, type EntryCategory } from "@/lib/tracks";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** ستون‌های خروجی امتیاز، به ترتیب نمایش؛ هر ردیف یک ثبت (تیم در یک محور) است. مشترک بین CSV و اکسل. */
export const ENTRY_COLUMNS = [
  { key: "team", header: "تیم", width: 22 },
  { key: "track", header: "محور", width: 16 },
  { key: "category", header: "دسته", width: 10 },
  { key: "product", header: "محصول", width: 24 },
  { key: "ptsJury", header: "امتیاز داوری", width: 12 },
  { key: "ptsMarket", header: "امتیاز بازار", width: 12 },
  { key: "ptsAi", header: "امتیاز هوش مصنوعی", width: 14 },
  { key: "cheatPenalty", header: "کسر تقلب", width: 10 },
  { key: "total", header: "امتیاز کل", width: 12 },
  { key: "rank", header: "رتبه در محور", width: 10 },
  { key: "overallRank", header: "رتبهٔ کلی", width: 10 },
  { key: "activeInstalls", header: "نصب فعال", width: 12 },
  { key: "revenueToman", header: "درآمد (تومان)", width: 14 },
  { key: "rating", header: "امتیاز ستاره‌ای", width: 12 },
  { key: "commentCount", header: "تعداد نظر", width: 10 },
  { key: "flagged", header: "پرچم آمار", width: 10 },
  { key: "liveStatus", header: "منتشرشده روی بازار", width: 14 },
  { key: "juryRaw", header: "نمرهٔ داوران (۰..۱۰۰)", width: 14 },
  { key: "ai", header: "نمرهٔ هوش مصنوعی (۰..۱۰۰)", width: 16 },
  { key: "people", header: "حمایت با سکه (خام)", width: 14 },
  { key: "supporters", header: "تعداد حامیان", width: 12 },
  { key: "coinsReceived", header: "سکهٔ دریافتی", width: 12 },
  { key: "memberCount", header: "تعداد اعضا", width: 10 },
  { key: "solo", header: "شرکت فردی", width: 10 },
  { key: "cheatNote", header: "توضیح کسر تقلب", width: 24 },
] as const;

export type EntryRow = Record<(typeof ENTRY_COLUMNS)[number]["key"], string | number>;

/**
 * ردیف ثبت‌ها برای خروجی برگزارکننده، با نمرهٔ داوری (این خروجی فقط برای ادمین است).
 * بعد از تسویه همان عددهای ثبت‌شده؛ پیش از آن محاسبهٔ زنده.
 */
export async function loadEntryRows(): Promise<{ rows: EntryRow[]; settled: boolean }> {
  const settledAt = await getSettledAt();
  const [output, teams, tracks, products] = await Promise.all([
    settledAt ? loadSettledOutput() : computeScores({ includeJury: true }),
    prisma.team.findMany({ select: { id: true, name: true, solo: true, cheatNote: true } }),
    prisma.track.findMany({ select: { id: true, name: true } }),
    prisma.product.findMany({
      select: {
        id: true,
        liveStatus: true,
        bazaarStat: { select: { activeInstalls: true, revenueToman: true, rating: true, commentCount: true, flagged: true } },
      },
    }),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  const productById = new Map(products.map((p) => [p.id, p]));

  const rows = [...output.teams]
    .sort((a, b) => (a.overallRank ?? 0) - (b.overallRank ?? 0))
    .map((t): EntryRow => {
      const team = teamById.get(t.teamId);
      const product = t.productId ? productById.get(t.productId) : undefined;
      const stat = product?.bazaarStat;
      return {
        team: team?.name ?? t.teamId,
        track: trackName.get(t.trackId) ?? t.trackId,
        category: ENTRY_CATEGORY_LABEL[t.category as EntryCategory] ?? "",
        product: t.productName,
        ptsJury: r1(t.pts.jury),
        ptsMarket: r1(t.pts.market),
        ptsAi: r1(t.pts.ai),
        cheatPenalty: t.cheatPenalty,
        total: r1(t.total),
        rank: t.rank ?? "",
        overallRank: t.overallRank ?? "",
        activeInstalls: stat?.activeInstalls ?? "",
        revenueToman: stat?.revenueToman ?? "",
        rating: stat?.rating ?? "",
        commentCount: stat?.commentCount ?? "",
        flagged: stat ? (stat.flagged ? "بله" : "خیر") : "",
        liveStatus: product?.liveStatus === "LIVE" ? "بله" : "خیر",
        juryRaw: t.juryRaw === null ? "" : r1(t.juryRaw),
        ai: t.ai === null ? "" : r1(t.ai),
        people: r1(t.people),
        supporters: t.supporters,
        coinsReceived: t.coinsReceived,
        memberCount: t.memberCount,
        solo: team?.solo ? "بله" : "خیر",
        cheatNote: team?.cheatNote ?? "",
      };
    });
  return { rows, settled: !!settledAt };
}
