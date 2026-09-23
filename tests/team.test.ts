/**
 * تست واحد src/lib/team.ts روی یک پایگاه‌دادهٔ SQLite موقت (migrate deploy).
 * چون `pool: "forks"` است، این فایل در فرایند فرزند مجزای خودش اجرا می‌شود؛
 * پس تنظیم DATABASE_URL در این فایل با فایل‌های تست دیگر تداخل نمی‌کند.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let team: typeof import("../src/lib/team");
let phase: typeof import("../src/lib/phase");

beforeAll(async () => {
  db = createTempDb("team-test");
  ({ prisma } = await import("../src/lib/db"));
  team = await import("../src/lib/team");
  phase = await import("../src/lib/phase");
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

let counter = 0;
async function makeUser(role: string) {
  counter++;
  return prisma.user.create({
    data: {
      email: `team-test-${counter}@example.test`,
      passwordHash: "x",
      nickname: `کاربر ${counter}`,
      role,
      power: "HYPE",
    },
  });
}

describe("team.ts: createTeamForUser", () => {
  beforeAll(async () => {
    await phase.setPhase("IDEATION", null);
  });

  it("creates a team and adds the creator in the same transaction", async () => {
    const u = await makeUser("BUILDER");
    const res = await team.createTeamForUser(u.id, "تیم آزمون یک");
    expect(res.ok).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.teamId).not.toBeNull();
  });

  it("rejects a second team for a user already on one", async () => {
    const u = await makeUser("BUILDER");
    await team.createTeamForUser(u.id, "تیم آزمون دو");
    const res = await team.createTeamForUser(u.id, "تیم آزمون سه");
    expect(res.ok).toBeUndefined();
    expect(res.error).toBeTruthy();
  });

  it("rejects team creation outside the ideation-forming window", async () => {
    await phase.setPhase("BUILD", null);
    const u = await makeUser("BUILDER");
    const res = await team.createTeamForUser(u.id, "تیم دیرهنگام");
    expect(res.ok).toBeUndefined();
    expect(res.error).toBe("این کار فقط تا پایان فاز «اتاق ایده» ممکن است.");
    await phase.setPhase("IDEATION", null);
  });
});

describe("team.ts: joinBySlug (invite limits)", () => {
  it("lets members join up to the team cap (3)", async () => {
    const host = await makeUser("BUILDER");
    const created = await team.createTeamForUser(host.id, "تیم پیوستن");
    expect(created.ok).toBe(true);
    const hostAfter = await prisma.user.findUniqueOrThrow({ where: { id: host.id }, include: { team: true } });
    const slug = hostAfter.team!.slug;

    const j2 = await makeUser("STORYTELLER");
    const r2 = await team.joinBySlug(j2.id, slug);
    expect(r2.ok).toBe(true);

    const j3 = await makeUser("DEALMAKER");
    const r3 = await team.joinBySlug(j3.id, slug);
    expect(r3.ok).toBe(true);

    const count = await prisma.user.count({ where: { teamId: hostAfter.teamId } });
    expect(count).toBe(team.TEAM_FULL);
  });

  it("rejects joining once the team is full", async () => {
    const host = await makeUser("BUILDER");
    const created = await team.createTeamForUser(host.id, "تیم پر می‌شود");
    const hostAfter = await prisma.user.findUniqueOrThrow({ where: { id: host.id }, include: { team: true } });
    const slug = hostAfter.team!.slug;
    void created;

    await team.joinBySlug((await makeUser("STORYTELLER")).id, slug);
    await team.joinBySlug((await makeUser("DEALMAKER")).id, slug);
    const fourth = await makeUser("BUILDER");
    const r4 = await team.joinBySlug(fourth.id, slug);
    expect(r4.ok).toBeUndefined();
    expect(r4.error).toBeTruthy();
  });

  it("rejects joining a non-existent slug", async () => {
    const u = await makeUser("BUILDER");
    const res = await team.joinBySlug(u.id, "no-such-team-slug-ever");
    expect(res.ok).toBeUndefined();
    expect(res.error).toBeTruthy();
  });
});

describe("team.ts: inviteToTeam limits", () => {
  it("rejects inviting yourself", async () => {
    const host = await makeUser("BUILDER");
    await team.createTeamForUser(host.id, "تیم دعوت خود");
    const res = await team.inviteToTeam(host.id, host.email.toUpperCase());
    expect(res.error).toBe("نمی‌توانی خودت را دعوت کنی.");
  });

  it("rejects duplicate pending invites to the same email", async () => {
    const host = await makeUser("BUILDER");
    await team.createTeamForUser(host.id, "تیم دعوت تکراری");
    const other = await makeUser("STORYTELLER");
    const r1 = await team.inviteToTeam(host.id, other.email);
    expect(r1.ok).toBe(true);
    const r2 = await team.inviteToTeam(host.id, other.email);
    expect(r2.ok).toBeUndefined();
    expect(r2.error).toBeTruthy();
  });

  it("rejects inviting once the team is at capacity", async () => {
    const host = await makeUser("BUILDER");
    await team.createTeamForUser(host.id, "تیم دعوت پر");
    const hostAfter = await prisma.user.findUniqueOrThrow({ where: { id: host.id } });
    await team.joinBySlug((await makeUser("STORYTELLER")).id, (await prisma.team.findUniqueOrThrow({ where: { id: hostAfter.teamId! } })).slug);
    await team.joinBySlug((await makeUser("DEALMAKER")).id, (await prisma.team.findUniqueOrThrow({ where: { id: hostAfter.teamId! } })).slug);
    const res = await team.inviteToTeam(host.id, "someone-else@example.test");
    expect(res.error).toBe("تیم پر است؛ ظرفیت هر تیم سه نفر است.");
  });
});
