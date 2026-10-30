import { prisma } from "./db";
import { parseCriteria, parseWeights, type JuryCriterion, type TrackCategory, type TrackKind, type TrackWeights } from "./tracks";

export * from "./tracks";

export type TrackInfo = {
  id: string;
  name: string;
  description: string;
  kind: TrackKind;
  category: TrackCategory;
  status: string;
  order: number;
  weights: TrackWeights;
  criteria: JuryCriterion[];
};

function toInfo(t: {
  id: string;
  name: string;
  description: string;
  kind: string;
  category: string;
  status: string;
  order: number;
  weights: string;
  juryCriteria: string;
}): TrackInfo {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    kind: t.kind as TrackKind,
    category: t.category as TrackCategory,
    status: t.status,
    order: t.order,
    weights: parseWeights(t.weights),
    criteria: parseCriteria(t.juryCriteria),
  };
}

/** همهٔ محورها به ترتیب نمایش */
export async function listAllTracks(): Promise<TrackInfo[]> {
  const rows = await prisma.track.findMany({ orderBy: { order: "asc" } });
  return rows.map(toInfo);
}

/** محورهایی که شرکت‌کننده می‌بیند (مخفی‌ها حذف) */
export async function listVisibleTracks(): Promise<TrackInfo[]> {
  return (await listAllTracks()).filter((t) => t.status !== "hidden");
}

export async function getTrack(id: string): Promise<TrackInfo | null> {
  const row = await prisma.track.findUnique({ where: { id } });
  return row ? toInfo(row) : null;
}

/**
 * محور انتخاب‌شده از پارامتر نشانی؛ اگر نامعتبر یا مخفی باشد، نخستین محور باز (وگرنه نخستین محور دیده‌شدنی).
 * صفحه‌های ایده و ساخت از این برای نمایش محور جاری استفاده می‌کنند.
 */
export async function resolveTrack(param: string | undefined): Promise<{ track: TrackInfo | null; tracks: TrackInfo[] }> {
  const tracks = await listVisibleTracks();
  return { track: tracks.find((t) => t.id === param) ?? tracks.find((t) => t.status === "open") ?? tracks[0] ?? null, tracks };
}
