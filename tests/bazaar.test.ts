/**
 * تست src/lib/bazaar.ts: ثبت آمار، ورود گروهی از اکسل، پرچم تقلب، همگام‌سازی با درایور و برداشت نهایی.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let bazaar: typeof import("../src/lib/bazaar");
let scoring: typeof import("../src/lib/scoring");

beforeAll(async () => {
  db = createTempDb("bazaar-test");
  ({ prisma } = await import("../src/lib/db"));
  bazaar = await import("../src/lib/bazaar");
  scoring = await import("../src/lib/scoring");
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

let counter = 0;
async function makeProduct(opts: { bazaarPackage?: string; trackId?: string; liveStatus?: string } = {}) {
  counter++;
  const trackId = opts.trackId ?? "general";
  const team = await prisma.team.create({ data: { name: `تیم بازار ${counter}`, slug: `bazaar-team-${counter}` } });
  const product = await prisma.product.create({
    data: {
      teamId: team.id,
      trackId,
      slug: `${team.slug}-${trackId}`,
      name: `محصول ${counter}`,
      category: "TECH",
      bazaarPackage: opts.bazaarPackage ?? "",
      liveStatus: opts.liveStatus ?? "",
      submittedAt: new Date(),
    },
  });
  return { team, product };
}

async function statOf(productId: string) {
  return prisma.bazaarStat.findUnique({ where: { productId } });
}

describe("getBazaarSource", () => {
  it("پیش‌فرض manual است و مقدار نامعتبر هم manual می‌شود", async () => {
    expect(await bazaar.getBazaarSource()).toBe("manual");
    await prisma.setting.upsert({ where: { key: "bazaar_source" }, update: { value: "nope" }, create: { key: "bazaar_source", value: "nope" } });
    expect(await bazaar.getBazaarSource()).toBe("manual");
    await prisma.setting.update({ where: { key: "bazaar_source" }, data: { value: "off" } });
    expect(await bazaar.getBazaarSource()).toBe("off");
    await prisma.setting.delete({ where: { key: "bazaar_source" } });
  });
});

describe("saveBazaarStat", () => {
  it("آمار را با منبعش ذخیره و دوباره‌ثبت را جایگزین می‌کند", async () => {
    const { product } = await makeProduct();
    expect((await bazaar.saveBazaarStat(product.id, { activeInstalls: 100, revenueToman: 5000, rating: 4.5, commentCount: 12 }, "manual")).ok).toBe(true);
    expect(await statOf(product.id)).toMatchObject({ activeInstalls: 100, revenueToman: 5000, rating: 4.5, commentCount: 12, source: "manual" });
    expect((await bazaar.saveBazaarStat(product.id, { activeInstalls: 200 }, "excel")).ok).toBe(true);
    expect(await statOf(product.id)).toMatchObject({ activeInstalls: 200, revenueToman: 0, rating: null, commentCount: 0, source: "excel" });
    expect(await prisma.bazaarStat.count({ where: { productId: product.id } })).toBe(1);
  });

  it("عدد منفی، غیرعددی و ستارهٔ بیرون از ۰ تا ۵ رد می‌شود", async () => {
    const { product } = await makeProduct();
    expect((await bazaar.saveBazaarStat(product.id, { activeInstalls: -1 }, "manual")).error).toBeTruthy();
    expect((await bazaar.saveBazaarStat(product.id, { revenueToman: "abc" }, "manual")).error).toBeTruthy();
    expect((await bazaar.saveBazaarStat(product.id, { rating: 6 }, "manual")).error).toBeTruthy();
    expect((await bazaar.saveBazaarStat(product.id, { rating: -0.5 }, "manual")).error).toBeTruthy();
    expect(await statOf(product.id)).toBeNull();
  });

  it("رشتهٔ عددی پذیرفته و اعشار نصب گرد می‌شود؛ ستارهٔ خالی یعنی بدون ستاره", async () => {
    const { product } = await makeProduct();
    expect((await bazaar.saveBazaarStat(product.id, { activeInstalls: "12.6", rating: "" }, "excel")).ok).toBe(true);
    expect(await statOf(product.id)).toMatchObject({ activeInstalls: 13, rating: null });
  });

  it("محصول ناموجود خطا می‌دهد", async () => {
    expect((await bazaar.saveBazaarStat("no-such-product", { activeInstalls: 1 }, "manual")).error).toBe("محصول پیدا نشد.");
  });
});

describe("importBazaarRows", () => {
  it("ردیف با شناسهٔ بسته یا نشانی محصول پیدا می‌شود و منبعش excel است", async () => {
    const byPackage = await makeProduct({ bazaarPackage: "ir.test.bypackage" });
    const bySlug = await makeProduct();
    const res = await bazaar.importBazaarRows([
      { key: "ir.test.bypackage", activeInstalls: 10, revenueToman: 20, commentCount: 3, rating: 4 },
      { key: `  ${bySlug.product.slug}  `, activeInstalls: 30 },
    ]);
    expect(res).toEqual({ saved: 2, skipped: [] });
    expect(await statOf(byPackage.product.id)).toMatchObject({ activeInstalls: 10, revenueToman: 20, commentCount: 3, rating: 4, source: "excel" });
    expect(await statOf(bySlug.product.id)).toMatchObject({ activeInstalls: 30, source: "excel" });
  });

  it("ردیف ناشناخته، بدون شناسه یا با مقدار نامعتبر کنار گذاشته و گزارش می‌شود و بقیه ثبت می‌شوند", async () => {
    const good = await makeProduct({ bazaarPackage: "ir.test.good" });
    const bad = await makeProduct({ bazaarPackage: "ir.test.bad" });
    const res = await bazaar.importBazaarRows([
      { key: "ir.test.unknown", activeInstalls: 1 },
      { key: "   ", activeInstalls: 1 },
      { key: "ir.test.bad", activeInstalls: -5 },
      { key: "ir.test.good", activeInstalls: 7 },
    ]);
    expect(res.saved).toBe(1);
    expect(res.skipped).toEqual(["ir.test.unknown", "(ردیف بدون شناسه)", "ir.test.bad"]);
    expect(await statOf(good.product.id)).toMatchObject({ activeInstalls: 7 });
    expect(await statOf(bad.product.id)).toBeNull();
  });

  it("پرچم تقلب با ورود دوبارهٔ آمار پاک نمی‌شود", async () => {
    const { product } = await makeProduct({ bazaarPackage: "ir.test.keepflag" });
    await bazaar.setBazaarFlag(product.id, true, "نصب مشکوک");
    await bazaar.importBazaarRows([{ key: "ir.test.keepflag", activeInstalls: 99 }]);
    expect(await statOf(product.id)).toMatchObject({ activeInstalls: 99, flagged: true, flagNote: "نصب مشکوک" });
  });
});

describe("setBazaarFlag و اثرش بر امتیاز", () => {
  it("بدون آمار قبلی هم پرچم ثبت می‌شود و یادداشت کوتاه می‌شود", async () => {
    const { product } = await makeProduct();
    await bazaar.setBazaarFlag(product.id, true, `  ${"ن".repeat(500)}  `);
    const row = await statOf(product.id);
    expect(row?.flagged).toBe(true);
    expect(row?.flagNote).toHaveLength(400);
  });

  it("آمار پرچم‌خورده تا رفع پرچم امتیاز بازار نمی‌دهد", async () => {
    const { team, product } = await makeProduct();
    await bazaar.saveBazaarStat(product.id, { activeInstalls: 500, revenueToman: 100000, rating: 4.5, commentCount: 50 }, "manual");
    const market = async () => (await scoring.computeScores()).teams.find((t) => t.teamId === team.id && t.trackId === "general")!.pts.market;
    const before = await market();
    expect(before).toBeGreaterThan(0);

    await bazaar.setBazaarFlag(product.id, true, "مشکوک");
    expect(await market()).toBe(0);

    await bazaar.setBazaarFlag(product.id, false, "");
    expect(await market()).toBeCloseTo(before, 9);
  });
});

describe("syncBazaarStats", () => {
  const metrics = { activeInstalls: 42, revenueToman: 1000, rating: 4, commentCount: 5 };

  async function withApiSource<T>(fn: () => Promise<T>): Promise<T> {
    await prisma.setting.upsert({ where: { key: "bazaar_source" }, update: { value: "api" }, create: { key: "bazaar_source", value: "api" } });
    try {
      return await fn();
    } finally {
      await prisma.setting.deleteMany({ where: { key: "bazaar_source" } });
    }
  }

  it("بدون درایور یا وقتی منبع API نیست کاری نمی‌کند", async () => {
    const fetchMetrics = vi.fn(async () => metrics);
    expect(await bazaar.syncBazaarStats({ fetchMetrics })).toBe(0);
    expect(fetchMetrics).not.toHaveBeenCalled();
    expect(await withApiSource(() => bazaar.syncBazaarStats())).toBe(0);
  });

  it("فقط محصول دارای بسته همگام می‌شود؛ بستهٔ ناشناخته و خطای درایور شکستی نمی‌آورند؛ آمار برداشت‌شده عوض نمی‌شود", async () => {
    const known = await makeProduct({ bazaarPackage: "ir.sync.known" });
    const unknown = await makeProduct({ bazaarPackage: "ir.sync.unknown" });
    const broken = await makeProduct({ bazaarPackage: "ir.sync.broken" });
    const frozen = await makeProduct({ bazaarPackage: "ir.sync.frozen" });
    const noPackage = await makeProduct();
    await prisma.bazaarStat.create({ data: { productId: frozen.product.id, activeInstalls: 1, snapshotAt: new Date() } });

    const fetchMetrics = vi.fn(async (pkg: string) => {
      if (pkg === "ir.sync.unknown") return null;
      if (pkg === "ir.sync.broken") throw new Error("boom");
      return metrics;
    });
    // محصولات تست‌های قبلی هم بسته دارند؛ شمارش دقیق را از روی تماس‌ها می‌سنجیم
    const synced = await withApiSource(() => bazaar.syncBazaarStats({ fetchMetrics }));
    expect(synced).toBeGreaterThanOrEqual(1);

    expect(await statOf(known.product.id)).toMatchObject({ ...metrics, source: "api" });
    expect(await statOf(unknown.product.id)).toBeNull();
    expect(await statOf(broken.product.id)).toBeNull();
    expect(await statOf(frozen.product.id)).toMatchObject({ activeInstalls: 1 });
    expect(await statOf(noPackage.product.id)).toBeNull();
    expect(fetchMetrics).not.toHaveBeenCalledWith("ir.sync.frozen");
  });
});

describe("snapshotBazaarStats", () => {
  it("زمان برداشت فقط بار اول ثبت می‌شود", async () => {
    const { product } = await makeProduct();
    await bazaar.saveBazaarStat(product.id, { activeInstalls: 5 }, "manual");
    const first = new Date("2026-11-01T10:00:00Z");
    const second = new Date("2026-11-02T10:00:00Z");
    await bazaar.snapshotBazaarStats(first);
    expect((await statOf(product.id))?.snapshotAt?.toISOString()).toBe(first.toISOString());
    await bazaar.snapshotBazaarStats(second);
    expect((await statOf(product.id))?.snapshotAt?.toISOString()).toBe(first.toISOString());
  });
});

describe("listBazaarRows", () => {
  it("محصول دارای آمار، بسته یا وضعیت انتشار را با مقادیر پیش‌فرض برمی‌گرداند و بقیه را نه", async () => {
    const withStat = await makeProduct();
    await bazaar.saveBazaarStat(withStat.product.id, { activeInstalls: 9, rating: 3 }, "manual");
    const withPackage = await makeProduct({ bazaarPackage: "ir.list.package" });
    const live = await makeProduct({ liveStatus: "LIVE" });
    const nothing = await makeProduct();

    const rows = await bazaar.listBazaarRows();
    const find = (id: string) => rows.find((r) => r.productId === id);
    expect(find(withStat.product.id)).toMatchObject({ activeInstalls: 9, rating: 3, source: "manual", flagged: false, teamName: withStat.team.name, trackId: "general" });
    expect(find(withPackage.product.id)).toMatchObject({ bazaarPackage: "ir.list.package", activeInstalls: 0, rating: null, source: "", updatedAt: null });
    expect(find(live.product.id)).toMatchObject({ liveStatus: "LIVE" });
    expect(find(nothing.product.id)).toBeUndefined();
  });
});
