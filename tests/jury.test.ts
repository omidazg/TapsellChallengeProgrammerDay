/**
 * تست src/lib/jury.ts: نمره‌دهی داوران روی پایگاه‌دادهٔ موقت.
 * هر داور نمره‌ی جدای خودش را دارد و امتیاز نهایی میانگین همهٔ داوران است.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";
import { parseCriteria } from "../src/lib/tracks";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let jury: typeof import("../src/lib/jury");
let scoring: typeof import("../src/lib/scoring");

beforeAll(async () => {
  db = createTempDb("jury-test");
  ({ prisma } = await import("../src/lib/db"));
  jury = await import("../src/lib/jury");
  scoring = await import("../src/lib/scoring");
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

async function setJuryModule(status: string) {
  await prisma.setting.upsert({ where: { key: "module_jury" }, update: { value: status }, create: { key: "module_jury", value: status } });
}

beforeEach(async () => {
  await setJuryModule("open");
});

let counter = 0;
async function makeUser() {
  counter++;
  return prisma.user.create({
    data: { email: `jury-${counter}@example.test`, passwordHash: "x", nickname: `داور ${counter}`, role: "BUILDER", power: "", staffRole: "JUDGE" },
  });
}

async function makeProduct(submitted = true, trackId = "general") {
  counter++;
  const team = await prisma.team.create({ data: { name: `تیم داوری ${counter}`, slug: `jury-team-${counter}` } });
  const product = await prisma.product.create({
    data: {
      teamId: team.id,
      trackId,
      slug: `${team.slug}-${trackId}`,
      name: `محصول ${counter}`,
      category: "TECH",
      submittedAt: submitted ? new Date() : null,
    },
  });
  return { team, product };
}

async function criterionKeys(trackId = "general") {
  const track = await prisma.track.findUniqueOrThrow({ where: { id: trackId } });
  return parseCriteria(track.juryCriteria).map((c) => c.key);
}

function uniform(keys: string[], v: number) {
  return Object.fromEntries(keys.map((k) => [k, v]));
}

describe("canJudge", () => {
  it("فقط داور و مدیر داوری می‌کنند", () => {
    expect(jury.canJudge({ isAdmin: false, staffRole: "JUDGE" })).toBe(true);
    expect(jury.canJudge({ isAdmin: true, staffRole: "" })).toBe(true);
    expect(jury.canJudge({ isAdmin: false, staffRole: "" })).toBe(false);
    expect(jury.canJudge({ isAdmin: false, staffRole: "OPERATOR" })).toBe(false);
  });
});

describe("saveJuryScore", () => {
  it("بخش داوری به‌طور پیش‌فرض بسته است و نمره ثبت نمی‌شود", async () => {
    await prisma.setting.deleteMany({ where: { key: "module_jury" } });
    const judge = await makeUser();
    const { product } = await makeProduct();
    const keys = await criterionKeys();
    const res = await jury.saveJuryScore(judge.id, product.id, { scores: uniform(keys, 7) });
    expect(res.error).toContain("فعلاً باز نیست");
    expect(await prisma.juryScore.count({ where: { productId: product.id } })).toBe(0);
  });

  it("هر داور نمرهٔ خودش را دارد و ثبت دوباره همان نمره را عوض می‌کند", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const { product } = await makeProduct();
    const keys = await criterionKeys();

    expect((await jury.saveJuryScore(a.id, product.id, { scores: uniform(keys, 4) })).ok).toBe(true);
    expect((await jury.saveJuryScore(b.id, product.id, { scores: uniform(keys, 8) })).ok).toBe(true);
    expect(await prisma.juryScore.count({ where: { productId: product.id } })).toBe(2);

    expect((await jury.saveJuryScore(a.id, product.id, { scores: uniform(keys, 6), note: "بازبینی" })).ok).toBe(true);
    const rows = await prisma.juryScore.findMany({ where: { productId: product.id } });
    expect(rows).toHaveLength(2);
    const mine = rows.find((r) => r.judgeId === a.id)!;
    expect(JSON.parse(mine.scores)[keys[0]]).toBe(6);
    expect(mine.note).toBe("بازبینی");
  });

  it("نمره باید میان ۰ و ۱۰ باشد", async () => {
    const judge = await makeUser();
    const { product } = await makeProduct();
    const keys = await criterionKeys();
    expect((await jury.saveJuryScore(judge.id, product.id, { scores: uniform(keys, 11) })).error).toBeTruthy();
    expect((await jury.saveJuryScore(judge.id, product.id, { scores: uniform(keys, -1) })).error).toBeTruthy();
    expect((await jury.saveJuryScore(judge.id, product.id, { scores: uniform(keys, Number.NaN) })).error).toBeTruthy();
    expect(await prisma.juryScore.count({ where: { productId: product.id } })).toBe(0);
    expect((await jury.saveJuryScore(judge.id, product.id, { scores: uniform(keys, 0) })).ok).toBe(true);
    expect((await jury.saveJuryScore(judge.id, product.id, { scores: uniform(keys, 10) })).ok).toBe(true);
  });

  it("محصول ثبت‌نهایی‌نشده یا ناموجود نمره نمی‌گیرد", async () => {
    const judge = await makeUser();
    const { product } = await makeProduct(false);
    const keys = await criterionKeys();
    expect((await jury.saveJuryScore(judge.id, product.id, { scores: uniform(keys, 5) })).error).toBeTruthy();
    expect((await jury.saveJuryScore(judge.id, "no-such-product", { scores: uniform(keys, 5) })).error).toBeTruthy();
    expect(await prisma.juryScore.count({ where: { productId: product.id } })).toBe(0);
  });

  it("کلید خارج از معیارهای محور ذخیره نمی‌شود", async () => {
    const judge = await makeUser();
    const { product } = await makeProduct();
    const keys = await criterionKeys();
    const res = await jury.saveJuryScore(judge.id, product.id, { scores: { ...uniform(keys, 5), bogus: 9 } });
    expect(res.ok).toBe(true);
    const row = await prisma.juryScore.findFirstOrThrow({ where: { productId: product.id } });
    expect(JSON.parse(row.scores)).not.toHaveProperty("bogus");
  });
});

describe("listJuryRows", () => {
  it("فقط محصولات ثبت‌نهایی‌شده، نمرهٔ خود داور و تعداد داوران را برمی‌گرداند", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const { product } = await makeProduct();
    const { product: draft } = await makeProduct(false);
    const keys = await criterionKeys();
    await jury.saveJuryScore(a.id, product.id, { scores: uniform(keys, 3) });
    await jury.saveJuryScore(b.id, product.id, { scores: uniform(keys, 9) });

    const rows = await jury.listJuryRows(a.id);
    expect(rows.some((r) => r.productId === draft.id)).toBe(false);
    const row = rows.find((r) => r.productId === product.id)!;
    expect(row.judgeCount).toBe(2);
    expect(row.mine?.[keys[0]]).toBe(3);
    expect(row.criteria.map((c) => c.key)).toEqual(keys);

    const fresh = await makeUser();
    const hers = (await jury.listJuryRows(fresh.id)).find((r) => r.productId === product.id)!;
    expect(hers.mine).toEqual({});
    expect(hers.judgeCount).toBe(2);
  });
});

describe("میانگین داوران در امتیاز نهایی", () => {
  it("امتیاز داوری میانگین همهٔ داوران است نه آخرین نمره", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const { team, product } = await makeProduct();
    const keys = await criterionKeys();
    // محصول مرجع با نمرهٔ کامل تا مقیاس محور ثابت بماند (امتیاز نسبت به بهترین محور است)
    const { product: reference } = await makeProduct();
    await jury.saveJuryScore(a.id, reference.id, { scores: uniform(keys, 10) });
    await jury.saveJuryScore(a.id, product.id, { scores: uniform(keys, 10) });
    const entry = async () => (await scoring.computeScores()).teams.find((t) => t.teamId === team.id && t.trackId === "general")!;
    const onlyA = (await entry()).pts.jury;
    await jury.saveJuryScore(b.id, product.id, { scores: uniform(keys, 0) });
    const both = (await entry()).pts.jury;
    expect(onlyA).toBeGreaterThan(0);
    expect(both).toBeCloseTo(onlyA / 2, 9);
  });
});
