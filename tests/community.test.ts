/**
 * تست ویترین عمومی (src/lib/showcase.ts) و بورد خبر (src/lib/board.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let showcase: typeof import("../src/lib/showcase");
let board: typeof import("../src/lib/board");
let ms: typeof import("../src/lib/module-state");

beforeAll(async () => {
  db = createTempDb("community-test");
  ({ prisma } = await import("../src/lib/db"));
  showcase = await import("../src/lib/showcase");
  board = await import("../src/lib/board");
  ms = await import("../src/lib/module-state");
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

let counter = 0;
async function makeUser(teamId: string | null = null, displayName = "") {
  counter++;
  return prisma.user.create({
    data: { email: `c${counter}@arena.test`, passwordHash: "x", nickname: `بازیکن${counter}`, role: "BUILDER", power: "", teamId, displayName },
  });
}

async function makeTeamWithProduct(opts: { submitted?: boolean } = {}) {
  counter++;
  const team = await prisma.team.create({ data: { name: `تیم ${counter}`, slug: `team-${counter}` } });
  const member = await makeUser(team.id, `نام واقعی ${counter}`);
  const product = await prisma.product.create({
    data: { teamId: team.id, trackId: "general", slug: `${team.slug}-general`, name: `محصول ${counter}`, category: "TECH", submittedAt: opts.submitted === false ? null : new Date() },
  });
  return { team, member, product };
}

describe("ویترین", () => {
  it("درخواست فقط بعد از ثبت نهایی، و فقط محصول تأییدشده عمومی است", async () => {
    const draft = await makeTeamWithProduct({ submitted: false });
    expect((await showcase.requestShowcase(draft.member, "general")).error).toBeTruthy();

    const { member, product } = await makeTeamWithProduct();
    expect((await showcase.requestShowcase(member, "general")).ok).toBe(true);
    expect((await showcase.requestShowcase(member, "general")).error).toBeTruthy();
    expect(await showcase.getShowcaseProduct(product.slug)).toBeNull();

    await showcase.reviewShowcase("admin", product.id, "APPROVED", "");
    const p = await showcase.getShowcaseProduct(product.slug);
    expect(p?.makers.map((m) => m.name)).toEqual([member.displayName]);
    expect((await showcase.listShowcase()).some((c) => c.id === product.id)).toBe(true);

    await prisma.product.update({ where: { id: product.id }, data: { submittedAt: null } });
    expect(await showcase.getShowcaseProduct(product.slug)).toBeNull();
  });

  it("رأی: یک رأی برای هر نفر، قابل پس گرفتن، و رأی به تیم خودت ممنوع", async () => {
    const { member, product } = await makeTeamWithProduct();
    await showcase.requestShowcase(member, "general");
    await showcase.reviewShowcase("admin", product.id, "APPROVED", "");
    const voter = await makeUser(null);

    expect((await showcase.toggleVote(member, product.id)).error).toBeTruthy();
    expect(await showcase.toggleVote(voter, product.id)).toEqual({ ok: true, voted: true });
    expect(await showcase.hasVoted(voter.id, product.id)).toBe(true);
    expect(await showcase.toggleVote(voter, product.id)).toEqual({ ok: true, voted: false });
    expect(await prisma.showcaseVote.count({ where: { productId: product.id } })).toBe(0);

    await ms.setModuleStatus("showcase", "ro");
    expect((await showcase.toggleVote(voter, product.id)).error).toBeTruthy();
    await ms.setModuleStatus("showcase", "open");
  });

  it("نام مستعار وقتی نام نمایشی خالی است", () => {
    expect(showcase.publicName({ displayName: "  ", nickname: "کدنویس" })).toBe("کدنویس");
    expect(showcase.publicName({ displayName: "سارا", nickname: "کدنویس" })).toBe("سارا");
  });

  it("مرتب‌سازی بهترین‌ها بر اساس رأی", async () => {
    const a = await makeTeamWithProduct();
    const b = await makeTeamWithProduct();
    for (const x of [a, b]) {
      await showcase.requestShowcase(x.member, "general");
      await showcase.reviewShowcase("admin", x.product.id, "APPROVED", "");
    }
    for (let i = 0; i < 2; i++) await showcase.toggleVote(await makeUser(null), b.product.id);
    const top = await showcase.listShowcase({ sort: "top" });
    expect(top.findIndex((c) => c.id === b.product.id)).toBeLessThan(top.findIndex((c) => c.id === a.product.id));
    const hot = await showcase.listShowcase({ sort: "hot" });
    expect(hot[0].id).toBe(b.product.id);
  });
});

describe("بورد خبر", () => {
  const post = (extra: Partial<import("../src/lib/board").BoardPostInput> = {}) => ({ kind: "PROGRESS", body: "امروز صفحهٔ ورود را ساختیم", imageUrl: "", linkUrl: "", productId: "", ...extra });

  it("نوشتن فقط برای عضو تیم و با ورودی معتبر", async () => {
    const { member, product } = await makeTeamWithProduct();
    const other = await makeTeamWithProduct();
    expect((await board.createBoardPost(await makeUser(null), post())).error).toBeTruthy();
    expect((await board.createBoardPost(member, post({ kind: "NOPE" }))).error).toBeTruthy();
    expect((await board.createBoardPost(member, post({ body: "  " }))).error).toBeTruthy();
    expect((await board.createBoardPost(member, post({ linkUrl: "javascript:alert(1)" }))).error).toBeTruthy();
    expect((await board.createBoardPost(member, post({ productId: other.product.id }))).error).toBeTruthy();
    const ok = await board.createBoardPost(member, post({ productId: product.id, linkUrl: "https://example.com" }));
    expect(ok.ok).toBe(true);
    const view = await board.getBoardPost(ok.id!);
    expect(view?.authorName).toBe(member.displayName);
    expect(view?.product?.name).toBe(product.name);
  });

  it("سقف پست روزانهٔ هر تیم", async () => {
    const { member } = await makeTeamWithProduct();
    for (let i = 0; i < board.BOARD_POSTS_PER_DAY; i++) expect((await board.createBoardPost(member, post())).ok).toBe(true);
    expect((await board.createBoardPost(member, post())).error).toBeTruthy();
  });

  it("حذف فقط توسط همان تیم؛ گزارش یک‌بار؛ پست پنهان از فهرست حذف می‌شود", async () => {
    const { member, team } = await makeTeamWithProduct();
    const outsider = await makeUser(null);
    const { id } = await board.createBoardPost(member, post());
    expect((await board.deleteBoardPost(outsider, id!)).error).toBeTruthy();

    expect((await board.reportBoardPost(outsider, id!, "اسپم")).ok).toBe(true);
    expect((await board.reportBoardPost(outsider, id!, "اسپم")).error).toBeTruthy();

    await board.moderateBoardPost("admin", id!, { featured: true });
    expect((await board.listBoard()).featured.some((p) => p.id === id)).toBe(true);
    expect(await prisma.notification.count({ where: { userId: member.id, kind: "board" } })).toBe(1);

    await board.moderateBoardPost("admin", id!, { hidden: true });
    expect((await board.listBoard({ teamId: team.id })).posts.some((p) => p.id === id)).toBe(false);
    expect(await board.getBoardPost(id!)).toBeNull();

    expect((await board.deleteBoardPost(member, id!)).ok).toBe(true);
    expect(await prisma.boardReport.count({ where: { postId: id! } })).toBe(0);
  });

  it("بورد بسته اجازهٔ نوشتن نمی‌دهد", async () => {
    const { member } = await makeTeamWithProduct();
    await ms.setModuleStatus("board", "closed");
    expect((await board.createBoardPost(member, post())).error).toBeTruthy();
    await ms.setModuleStatus("board", "open");
  });
});
