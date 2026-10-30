/**
 * تست src/lib/module-state.ts و track-data.ts: وضعیت بخش‌ها، استثنای تیم، نگهبان محور
 * و یکتایی ایده و محصول به ازای تیم + محور، روی پایگاه‌دادهٔ موقت.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let ms: typeof import("../src/lib/module-state");
let tracks: typeof import("../src/lib/track-data");
let phase: typeof import("../src/lib/phase");
let productLib: typeof import("../src/lib/product");
let ideaLib: typeof import("../src/lib/idea");

beforeAll(async () => {
  db = createTempDb("module-state-test");
  ({ prisma } = await import("../src/lib/db"));
  ms = await import("../src/lib/module-state");
  tracks = await import("../src/lib/track-data");
  phase = await import("../src/lib/phase");
  productLib = await import("../src/lib/product");
  ideaLib = await import("../src/lib/idea");
  await phase.setPhase("LIVE", null);
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

afterEach(async () => {
  await prisma.setting.deleteMany({ where: { key: { startsWith: "module_" } } });
  await prisma.moduleException.deleteMany();
  await phase.setPhase("LIVE", null);
});

let counter = 0;
async function makeTeam() {
  counter++;
  return prisma.team.create({ data: { name: `تیم بخش ${counter}`, slug: `module-team-${counter}` } });
}

function ideaData(teamId: string, trackId: string) {
  return { teamId, trackId, title: `ایده ${trackId}`, oneLiner: "x", problem: "x", audience: "x", buildPlan: "x", fundingCap: 0, revenueShare: 0, submittedAt: new Date() };
}

describe("module-state: وضعیت بخش‌ها", () => {
  it("پیش‌فرض‌ها: داوری بسته، جدول امتیاز فقط‌خواندنی، نتایج مخفی و بقیه باز", async () => {
    const statuses = await ms.getModuleStatuses();
    expect(statuses.jury).toBe("closed");
    expect(statuses.leaderboard).toBe("ro");
    expect(statuses.results).toBe("hidden");
    expect(statuses.team).toBe("open");
    expect(statuses.invest).toBe("open");
    expect(statuses.coins).toBe("open");
    for (const key of ms.MODULE_KEYS) expect(statuses[key]).toBe(ms.MODULE_DEFAULTS[key]);
  });

  it("setModuleStatus ذخیره می‌کند و upsert است", async () => {
    await ms.setModuleStatus("jury", "open");
    expect(await ms.getModuleStatus("jury")).toBe("open");
    await ms.setModuleStatus("jury", "ro");
    expect(await ms.getModuleStatus("jury")).toBe("ro");
    expect(await prisma.setting.count({ where: { key: "module_jury" } })).toBe(1);
  });

  it("مقدار خراب در تنظیمات به پیش‌فرض برمی‌گردد", async () => {
    await prisma.setting.create({ data: { key: "module_team", value: "banana" } });
    expect(await ms.getModuleStatus("team")).toBe(ms.MODULE_DEFAULTS.team);
  });

  it("فقط open اجازهٔ انجام می‌دهد؛ ro دیده می‌شود، closed صفحه‌ی بسته دارد، hidden دیده نمی‌شود", async () => {
    await ms.setModuleStatus("invest", "open");
    expect(await ms.moduleOpen("invest")).toBe(true);
    expect(await ms.moduleGate("invest")).toBeNull();
    expect(await ms.moduleVisible("invest")).toBe(true);

    await ms.setModuleStatus("invest", "ro");
    expect(await ms.moduleOpen("invest")).toBe(false);
    expect(await ms.moduleGate("invest")).toBe(ms.moduleClosedMessage("invest"));
    expect(await ms.moduleVisible("invest")).toBe(true);

    await ms.setModuleStatus("invest", "closed");
    expect(await ms.moduleOpen("invest")).toBe(false);

    await ms.setModuleStatus("invest", "hidden");
    expect(await ms.moduleOpen("invest")).toBe(false);
    expect(await ms.moduleVisible("invest")).toBe(false);
  });

  it("پس از پایان مسابقه بخش‌های بازی که باز بودند فقط‌خواندنی می‌شوند", async () => {
    await ms.setModuleStatus("invest", "open");
    await phase.setPhase("CLOSED", null);
    for (const key of ms.MODULES_FROZEN_AT_END) {
      const status = await ms.getModuleStatus(key);
      expect(status).not.toBe("open");
    }
    expect(await ms.getModuleStatus("invest")).toBe("ro");
    expect(await ms.moduleOpen("invest")).toBe(false);
  });

  it("پایان مسابقه بخش‌های خارج از فهرست انجماد را دست نمی‌زند", async () => {
    const free = ms.MODULE_KEYS.filter((k) => !ms.MODULES_FROZEN_AT_END.includes(k));
    for (const key of free) await ms.setModuleStatus(key, "open");
    await phase.setPhase("CLOSED", null);
    for (const key of free) expect(await ms.getModuleStatus(key)).toBe("open");
  });
});

describe("module-state: استثنای تیم", () => {
  it("استثنا بخش را فقط برای همان تیم باز می‌کند", async () => {
    const special = await makeTeam();
    const plain = await makeTeam();
    await ms.setModuleStatus("invest", "closed");
    await ms.addModuleException("invest", special.id, "admin");

    expect(await ms.moduleOpen("invest", special.id)).toBe(true);
    expect(await ms.moduleGate("invest", special.id)).toBeNull();
    expect(await ms.moduleStatusFor("invest", special.id)).toBe("open");

    expect(await ms.moduleOpen("invest", plain.id)).toBe(false);
    expect(await ms.moduleOpen("invest", null)).toBe(false);
    expect(await ms.moduleOpen("invest")).toBe(false);
    expect(await ms.moduleStatusFor("invest", plain.id)).toBe("closed");
  });

  it("بخش مخفی برای تیم دارای استثنا دیده می‌شود", async () => {
    const special = await makeTeam();
    await ms.setModuleStatus("results", "hidden");
    await ms.addModuleException("results", special.id, "admin");
    expect(await ms.moduleVisible("results", special.id)).toBe(true);
    expect(await ms.moduleVisible("results")).toBe(false);
  });

  it("moduleStatusesFor وضعیت منو را با استثناهای تیم می‌سازد و کلید ناشناخته را نادیده می‌گیرد", async () => {
    const special = await makeTeam();
    await ms.setModuleStatus("invest", "closed");
    await ms.setModuleStatus("coins", "closed");
    await ms.addModuleException("invest", special.id, "admin");
    await ms.addModuleException("track:os", special.id, "admin");
    const forTeam = await ms.moduleStatusesFor(special.id);
    expect(forTeam.invest).toBe("open");
    expect(forTeam.coins).toBe("closed");
    expect(forTeam).not.toHaveProperty("track:os");
    expect((await ms.moduleStatusesFor(null)).invest).toBe("closed");
  });

  it("افزودن دوباره تکراری نمی‌سازد؛ حذف، استثنا را برمی‌دارد", async () => {
    const team = await makeTeam();
    await ms.addModuleException("invest", team.id, "admin");
    await ms.addModuleException("invest", team.id, "admin2");
    const rows = await ms.listModuleExceptions();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ moduleKey: "invest", teamId: team.id, createdBy: "admin" });

    await ms.setModuleStatus("invest", "closed");
    await ms.removeModuleException(rows[0].id);
    expect(await ms.moduleOpen("invest", team.id)).toBe(false);
    expect(await ms.listModuleExceptions()).toHaveLength(0);
  });
});

describe("module-state: نگهبان محور", () => {
  it("محور باز null، محور مخفی پیام خطا و محور ناموجود خطا می‌دهد", async () => {
    expect(await ms.trackGate("general")).toBeNull();
    expect(await ms.trackGate("content")).toBeNull();
    expect(await ms.trackGate("os")).toContain("فعلاً باز نیست");
    expect(await ms.trackGate("no-such-track")).toBe("محور پیدا نشد.");
  });

  it("استثنای track:<id> محور را فقط برای همان تیم باز می‌کند", async () => {
    const special = await makeTeam();
    const plain = await makeTeam();
    await ms.addModuleException("track:os", special.id, "admin");
    expect(await ms.trackGate("os", special.id)).toBeNull();
    expect(await ms.trackGate("os", plain.id)).toContain("فعلاً باز نیست");
  });

  it("استثنای یک بخش محور بسته را باز نمی‌کند", async () => {
    const team = await makeTeam();
    await ms.addModuleException("invest", team.id, "admin");
    expect(await ms.trackGate("os", team.id)).not.toBeNull();
  });
});

describe("track-data: محورها", () => {
  it("سه محور با وزن‌ها و دسته‌های مصوب مهاجرت می‌شوند", async () => {
    const all = await tracks.listAllTracks();
    expect(all.map((t) => t.id)).toEqual(["general", "content", "os"]);
    const general = all[0];
    expect(general.category).toBe("MIXED");
    expect(general.weights).toMatchObject({ ai: 30, market: 30, jury: 40 });
    expect(all[1].category).toBe("NON_TECH");
    expect(all[1].weights).toMatchObject({ ai: 42, market: 6, jury: 52 });
    expect(all[2].status).toBe("hidden");
    expect(all[2].category).toBe("TECH");
  });

  it("محور مخفی در فهرست شرکت‌کننده نیست و با پارامتر نشانی هم انتخاب نمی‌شود", async () => {
    expect((await tracks.listVisibleTracks()).map((t) => t.id)).toEqual(["general", "content"]);
    expect((await tracks.resolveTrack("content")).track?.id).toBe("content");
    expect((await tracks.resolveTrack("os")).track?.id).toBe("general");
    expect((await tracks.resolveTrack(undefined)).track?.id).toBe("general");
    expect((await tracks.resolveTrack("nope")).track?.id).toBe("general");
  });

  it("getTrack محور ناموجود را null می‌دهد", async () => {
    expect((await tracks.getTrack("content"))?.id).toBe("content");
    expect(await tracks.getTrack("nope")).toBeNull();
  });
});

describe("یکتایی چندمحوره: هر تیم در هر محور یک ایده و یک محصول", () => {
  it("دو ایده در یک محور رد می‌شود، در دو محور مجاز است", async () => {
    const team = await makeTeam();
    await prisma.idea.create({ data: ideaData(team.id, "general") });
    await expect(prisma.idea.create({ data: ideaData(team.id, "general") })).rejects.toMatchObject({ code: "P2002" });
    await expect(prisma.idea.create({ data: ideaData(team.id, "content") })).resolves.toBeTruthy();
    expect(await prisma.idea.count({ where: { teamId: team.id } })).toBe(2);
  });

  it("دو محصول در یک محور رد می‌شود، در دو محور مجاز است و هر کدام اسلاگ خودش را دارد", async () => {
    const team = await makeTeam();
    const slugFor = (trackId: string) => productLib.productSlug(team.slug, trackId);
    expect(slugFor("content")).toBe(`${team.slug}-content`);
    await prisma.product.create({ data: { teamId: team.id, trackId: "general", slug: slugFor("general"), name: "الف" } });
    await expect(
      prisma.product.create({ data: { teamId: team.id, trackId: "general", slug: `${team.slug}-again`, name: "ب" } })
    ).rejects.toMatchObject({ code: "P2002" });
    await prisma.product.create({ data: { teamId: team.id, trackId: "content", slug: slugFor("content"), name: "ج" } });

    expect((await productLib.getProductForTeam(team.id, "general"))?.name).toBe("الف");
    expect((await productLib.getProductForTeam(team.id, "content"))?.name).toBe("ج");
    expect(await productLib.getProductForTeam(team.id, "os")).toBeNull();
    expect((await productLib.getProductBySlug(slugFor("content")))?.name).toBe("ج");
  });

  it("دو تیم می‌توانند در یک محور هر کدام ایدهٔ خودشان را داشته باشند", async () => {
    const a = await makeTeam();
    const b = await makeTeam();
    await prisma.idea.create({ data: ideaData(a.id, "content") });
    await expect(prisma.idea.create({ data: ideaData(b.id, "content") })).resolves.toBeTruthy();
    expect(await prisma.idea.findUnique({ where: { teamId_trackId: { teamId: a.id, trackId: "content" } } })).toBeTruthy();
    expect(await prisma.idea.findUnique({ where: { teamId_trackId: { teamId: a.id, trackId: "general" } } })).toBeNull();
  });

  it("کف حمایت ایده‌های محور مخفی را نشان نمی‌دهد و با محور فیلتر می‌شود", async () => {
    const team = await makeTeam();
    await prisma.idea.create({ data: ideaData(team.id, "general") });
    await prisma.idea.create({ data: ideaData(team.id, "os") });
    const titles = async (trackId?: string) => (await ideaLib.getIdeasForFloor("all", trackId)).filter((i) => i.teamId === team.id).map((i) => i.trackId);
    expect(await titles()).toEqual(["general"]);
    expect(await titles("general")).toEqual(["general"]);
    expect(await titles("content")).toEqual([]);
  });
});
