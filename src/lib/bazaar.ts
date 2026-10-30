/**
 * آمار محصول‌ها در بازار. منبع آمار یک درایور است، مثل پیامک و درگاه پرداخت: فعلاً ورود دستی یا اکسل،
 * و وقتی API بازار استودیو آماده شد فقط یک درایور در `apiDriver` اضافه می‌شود و بقیهٔ کد دست نمی‌خورد.
 * نیازمندی‌های API در docs/bazaar-studio-integration.md آمده است.
 */
import { prisma } from "./db";
import { getSetting } from "./phase";
import { BAZAAR_SOURCES, type BazaarSource } from "./modules";
import { invalidate } from "./ttl-cache";

export type BazaarMetrics = {
  activeInstalls: number;
  revenueToman: number;
  rating: number | null;
  commentCount: number;
};

export interface BazaarDriver {
  /** آمار یک بسته؛ null یعنی بازار این بسته را نمی‌شناسد. */
  fetchMetrics(packageName: string): Promise<BazaarMetrics | null>;
}

/** تا آماده‌شدن API بازار استودیو درایوری وجود ندارد و همگام‌سازی کاری نمی‌کند. */
const apiDriver: BazaarDriver | null = null;

export async function getBazaarSource(): Promise<BazaarSource> {
  const raw = await getSetting("bazaar_source", "manual");
  return (BAZAAR_SOURCES as readonly string[]).includes(raw) ? (raw as BazaarSource) : "manual";
}

function cleanMetrics(input: Partial<Record<keyof BazaarMetrics, unknown>>): BazaarMetrics | string {
  const int = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v ?? 0);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };
  const activeInstalls = int(input.activeInstalls);
  const revenueToman = int(input.revenueToman);
  const commentCount = int(input.commentCount);
  if (activeInstalls === null || revenueToman === null || commentCount === null) return "آمار باید عدد نامنفی باشد.";
  let rating: number | null = null;
  if (input.rating !== null && input.rating !== undefined && input.rating !== "") {
    const r = Number(input.rating);
    if (!Number.isFinite(r) || r < 0 || r > 5) return "امتیاز ستاره‌ای باید بین ۰ تا ۵ باشد.";
    rating = r;
  }
  return { activeInstalls, revenueToman, rating, commentCount };
}

/** ثبت آمار یک محصول (ورود دستی، اکسل یا API) */
export async function saveBazaarStat(
  productId: string,
  input: Partial<Record<keyof BazaarMetrics, unknown>>,
  source: "manual" | "excel" | "api"
): Promise<{ ok?: boolean; error?: string }> {
  const metrics = cleanMetrics(input);
  if (typeof metrics === "string") return { error: metrics };
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { error: "محصول پیدا نشد." };
  await prisma.bazaarStat.upsert({
    where: { productId },
    update: { ...metrics, source },
    create: { productId, ...metrics, source },
  });
  invalidate("scores:");
  return { ok: true };
}

/** پرچم مشکوک به نصب یا نظر جعلی؛ آمار پرچم‌خورده تا رفع پرچم در امتیاز حساب نمی‌شود. */
export async function setBazaarFlag(productId: string, flagged: boolean, note: string) {
  await prisma.bazaarStat.upsert({
    where: { productId },
    update: { flagged, flagNote: note.trim().slice(0, 400) },
    create: { productId, flagged, flagNote: note.trim().slice(0, 400) },
  });
  invalidate("scores:");
}

export type BazaarImportRow = { key: string } & Partial<Record<keyof BazaarMetrics, unknown>>;

/** ورود گروهی از اکسل؛ هر ردیف با شناسهٔ بسته یا نشانی محصول پیدا می‌شود. */
export async function importBazaarRows(rows: BazaarImportRow[]): Promise<{ saved: number; skipped: string[] }> {
  let saved = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    const key = row.key.trim();
    const product = key
      ? await prisma.product.findFirst({ where: { OR: [{ bazaarPackage: key }, { slug: key }] }, select: { id: true } })
      : null;
    if (!product) {
      skipped.push(key || "(ردیف بدون شناسه)");
      continue;
    }
    const res = await saveBazaarStat(product.id, row, "excel");
    if (res.ok) saved++;
    else skipped.push(key);
  }
  return { saved, skipped };
}

/** همگام‌سازی از API (زمان‌بند صدا می‌زند)؛ تا وقتی درایور و منبع API فعال نباشد کاری نمی‌کند. */
export async function syncBazaarStats(driver: BazaarDriver | null = apiDriver): Promise<number> {
  if (!driver || (await getBazaarSource()) !== "api") return 0;
  // پس از برداشت نهایی آمار قفل است و همگام‌سازی نباید امتیاز را جابه‌جا کند.
  const products = await prisma.product.findMany({
    where: { bazaarPackage: { not: "" }, OR: [{ bazaarStat: null }, { bazaarStat: { snapshotAt: null } }] },
    select: { id: true, bazaarPackage: true },
  });
  let synced = 0;
  for (const p of products) {
    const metrics = await driver.fetchMetrics(p.bazaarPackage).catch(() => null);
    if (!metrics) continue;
    const res = await saveBazaarStat(p.id, metrics, "api");
    if (res.ok) synced++;
  }
  return synced;
}

/** برداشت نهایی در ددلاین: زمان برداشت ثبت می‌شود تا معلوم باشد امتیاز از کدام لحظهٔ آمار آمده. */
export async function snapshotBazaarStats(now: Date = new Date()) {
  await prisma.bazaarStat.updateMany({ where: { snapshotAt: null }, data: { snapshotAt: now } });
}

export type BazaarRow = {
  productId: string;
  productName: string;
  teamName: string;
  trackId: string;
  bazaarPackage: string;
  liveStatus: string;
  activeInstalls: number;
  revenueToman: number;
  rating: number | null;
  commentCount: number;
  source: string;
  flagged: boolean;
  flagNote: string;
  updatedAt: Date | null;
};

/** فهرست محصول‌ها و آمارشان برای پنل */
export async function listBazaarRows(): Promise<BazaarRow[]> {
  const products = await prisma.product.findMany({
    where: { OR: [{ liveStatus: { not: "" } }, { bazaarPackage: { not: "" } }, { bazaarStat: { isNot: null } }] },
    include: { team: { select: { name: true } }, bazaarStat: true },
    orderBy: { name: "asc" },
  });
  return products.map((p) => ({
    productId: p.id,
    productName: p.name,
    teamName: p.team.name,
    trackId: p.trackId,
    bazaarPackage: p.bazaarPackage,
    liveStatus: p.liveStatus,
    activeInstalls: p.bazaarStat?.activeInstalls ?? 0,
    revenueToman: p.bazaarStat?.revenueToman ?? 0,
    rating: p.bazaarStat?.rating ?? null,
    commentCount: p.bazaarStat?.commentCount ?? 0,
    source: p.bazaarStat?.source ?? "",
    flagged: p.bazaarStat?.flagged ?? false,
    flagNote: p.bazaarStat?.flagNote ?? "",
    updatedAt: p.bazaarStat?.updatedAt ?? null,
  }));
}
