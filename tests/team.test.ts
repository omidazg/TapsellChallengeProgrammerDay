/**
 * تست واحد src/lib/team.ts (+ team-access و team-settings) روی یک پایگاه‌دادهٔ SQLite موقت (migrate deploy).
 * چون `pool: "forks"` است، این فایل در فرایند فرزند مجزای خودش اجرا می‌شود؛
 * پس تنظیم DATABASE_URL در این فایل با فایل‌های تست دیگر تداخل نمی‌کند.
 *
 * قواعد تیم در بازی ساده‌شده: تیم ۱ تا ۳ نفره، بدون سرپرست (هر عضو کارهای تیم را انجام می‌دهد)،
 * و «شرکت فردی» = تیم یک‌نفرهٔ بسته (solo) که دعوت، لینک پیوستن و هم‌تیم‌سازی خودکار به آن نمی‌رسد.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let team: typeof import("../src/lib/team");
let phase: typeof import("../src/lib/phase");
let access: typeof import("../src/lib/team-access");
let teamSettings: typeof import("../src/lib/team-settings");

const SOLO_CLOSED = "این شرکت‌کننده فردی بازی می‌کند و هم‌تیمی نمی‌پذیرد.";
const PHASE_ERR = "این کار فقط تا پایان فاز «اتاق ایده» ممکن است.";

beforeAll(async () => {
  db = createTempDb("team-test");
  ({ prisma } = await import("../src/lib/db"));
  team = await import("../src/lib/team");
  phase = await import("../src/lib/phase");
  access = await import("../src/lib/team-access");
  teamSettings = await import("../src/lib/team-settings");
  await phase.setPhase("IDEATION", null);
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

let counter = 0;
async function makeUser(role = "BUILDER", nickname?: string) {
  counter++;
  return prisma.user.create({
    data: {
      email: `team-test-${counter}@example.test`,
      passwordHash: "x",
      nickname: nickname ?? `کاربر ${counter}`,
      role,
      power: "",
    },
  });
}

async function reload(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { team: true } });
}

/** تیم عادی با میزبان؛ اسلاگ و شناسهٔ تیم را برمی‌گرداند */
async function hostTeam(name: string) {
  const host = await makeUser("BUILDER");
  const res = await team.createTeamForUser(host.id, name);
  expect(res.ok).toBe(true);
  const after = await reload(host.id);
  return { host, teamId: after.teamId!, slug: after.team!.slug };
}

/** با فاز موقت اجرا می‌کند و در پایان به IDEATION برمی‌گرداند */
async function inPhase<T>(p: Parameters<typeof phase.setPhase>[0], fn: () => Promise<T>): Promise<T> {
  await phase.setPhase(p, null);
  try {
    return await fn();
  } finally {
    await phase.setPhase("IDEATION", null);
  }
}

describe("team.ts: createTeamForUser", () => {
  it("creates a team and adds the creator in the same transaction", async () => {
    const u = await makeUser();
    const res = await team.createTeamForUser(u.id, "تیم آزمون یک");
    expect(res.ok).toBe(true);
    const after = await reload(u.id);
    expect(after.teamId).not.toBeNull();
    expect(after.team?.solo).toBe(false);
  });

  it("rejects a second team for a user already on one", async () => {
    const u = await makeUser();
    await team.createTeamForUser(u.id, "تیم آزمون دو");
    const res = await team.createTeamForUser(u.id, "تیم آزمون سه");
    expect(res.ok).toBeUndefined();
    expect(res.error).toBeTruthy();
  });

  it("rejects a duplicate team name", async () => {
    await hostTeam("تیم نام تکراری");
    const u = await makeUser();
    const res = await team.createTeamForUser(u.id, "تیم نام تکراری");
    expect(res.error).toBe("این نام تیم قبلاً استفاده شده است.");
    expect((await reload(u.id)).teamId).toBeNull();
  });

  it("rejects team creation outside the ideation-forming window", async () => {
    const u = await makeUser();
    const res = await inPhase("BUILD", () => team.createTeamForUser(u.id, "تیم دیرهنگام"));
    expect(res.ok).toBeUndefined();
    expect(res.error).toBe(PHASE_ERR);
  });
});

describe("team.ts: joinBySlug (invite limits)", () => {
  it("lets members join up to the team cap (3)", async () => {
    const { teamId, slug } = await hostTeam("تیم پیوستن");
    expect((await team.joinBySlug((await makeUser("STORYTELLER")).id, slug)).ok).toBe(true);
    expect((await team.joinBySlug((await makeUser("DEALMAKER")).id, slug)).ok).toBe(true);
    expect(await prisma.user.count({ where: { teamId } })).toBe(team.TEAM_FULL);
    expect(team.TEAM_FULL).toBe(3);
  });

  it("rejects joining once the team is full", async () => {
    const { slug } = await hostTeam("تیم پر می‌شود");
    await team.joinBySlug((await makeUser("STORYTELLER")).id, slug);
    await team.joinBySlug((await makeUser("DEALMAKER")).id, slug);
    const r4 = await team.joinBySlug((await makeUser()).id, slug);
    expect(r4.ok).toBeUndefined();
    expect(r4.error).toBe("این تیم پر شده است.");
  });

  it("a team of two is a valid team (members may share the same skill)", async () => {
    const { teamId, slug } = await hostTeam("تیم دونفره");
    const r = await team.joinBySlug((await makeUser("BUILDER")).id, slug);
    expect(r.ok).toBe(true);
    expect(await prisma.user.count({ where: { teamId } })).toBe(2);
  });

  it("rejects joining a non-existent slug", async () => {
    const u = await makeUser();
    const res = await team.joinBySlug(u.id, "no-such-team-slug-ever");
    expect(res.ok).toBeUndefined();
    expect(res.error).toBeTruthy();
  });
});

describe("team.ts: inviteToTeam limits", () => {
  it("rejects inviting yourself", async () => {
    const { host } = await hostTeam("تیم دعوت خود");
    const res = await team.inviteToTeam(host.id, host.email.toUpperCase());
    expect(res.error).toBe("نمی‌توانی خودت را دعوت کنی.");
  });

  it("rejects duplicate pending invites to the same email", async () => {
    const { host } = await hostTeam("تیم دعوت تکراری");
    const other = await makeUser("STORYTELLER");
    const r1 = await team.inviteToTeam(host.id, other.email);
    expect(r1.ok).toBe(true);
    const r2 = await team.inviteToTeam(host.id, other.email);
    expect(r2.ok).toBeUndefined();
    expect(r2.error).toBeTruthy();
  });

  it("rejects inviting once the team is at capacity", async () => {
    const { host, slug } = await hostTeam("تیم دعوت پر");
    await team.joinBySlug((await makeUser("STORYTELLER")).id, slug);
    await team.joinBySlug((await makeUser("DEALMAKER")).id, slug);
    const res = await team.inviteToTeam(host.id, "someone-else@example.test");
    expect(res.error).toBe("تیم پر است؛ ظرفیت هر تیم سه نفر است.");
  });

  it("any member (not only the creator) can invite", async () => {
    const { slug, teamId } = await hostTeam("تیم دعوت عضو دوم");
    const second = await makeUser("STORYTELLER");
    await team.joinBySlug(second.id, slug);
    const res = await team.inviteToTeam(second.id, "invited-by-second@example.test");
    expect(res.ok).toBe(true);
    expect(await prisma.teamInvite.count({ where: { teamId, inviterId: second.id, status: "PENDING" } })).toBe(1);
  });
});

describe("team.ts: goSolo (شرکت فردی)", () => {
  it("برای کاربر بی‌تیم یک تیم یک‌نفرهٔ بسته به نام نام مستعارش می‌سازد", async () => {
    const u = await makeUser("BUILDER", "تک‌نفره آزمون");
    const res = await team.goSolo(u.id);
    expect(res.ok).toBe(true);
    const after = await reload(u.id);
    expect(after.team).toMatchObject({ name: "تک‌نفره آزمون", solo: true });
    expect(await prisma.user.count({ where: { teamId: after.teamId } })).toBe(1);
  });

  it("اگر نام گرفته شده باشد پسوند عددی می‌گیرد", async () => {
    const a = await makeUser("BUILDER", "نام مشترک فردی");
    const b = await makeUser("BUILDER", "نام مشترک فردی");
    expect((await team.goSolo(a.id)).ok).toBe(true);
    expect((await team.goSolo(b.id)).ok).toBe(true);
    expect((await reload(a.id)).team?.name).toBe("نام مشترک فردی");
    expect((await reload(b.id)).team?.name).toBe("نام مشترک فردی ۲");
  });

  it("تیم یک‌نفرهٔ موجود را بسته می‌کند و دعوت‌های در انتظارش را رد می‌کند", async () => {
    const { host, teamId } = await hostTeam("تیم تک‌عضوی");
    const invitee = await makeUser();
    expect((await team.inviteToTeam(host.id, invitee.email)).ok).toBe(true);

    const res = await team.goSolo(host.id);
    expect(res.ok).toBe(true);
    const t = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(t.solo).toBe(true);
    expect(t.name).toBe("تیم تک‌عضوی"); // همان تیم، تیم تازه ساخته نمی‌شود
    expect(await prisma.teamInvite.count({ where: { teamId, status: "PENDING" } })).toBe(0);
    expect(await prisma.teamInvite.count({ where: { teamId, status: "DECLINED" } })).toBe(1);
  });

  it("تیمی که بیش از یک عضو دارد نمی‌تواند فردی شود", async () => {
    const { host, slug, teamId } = await hostTeam("تیم دونفره نه‌فردی");
    await team.joinBySlug((await makeUser()).id, slug);
    const res = await team.goSolo(host.id);
    expect(res.error).toBe("تیمت عضو دیگری دارد؛ شرکت فردی فقط برای تیم یک‌نفره است.");
    expect((await prisma.team.findUniqueOrThrow({ where: { id: teamId } })).solo).toBe(false);
  });

  it("بیرون از بازهٔ تشکیل تیم رد می‌شود", async () => {
    const u = await makeUser();
    const res = await inPhase("SEED_ROUND", () => team.goSolo(u.id));
    expect(res.error).toBe(PHASE_ERR);
    expect((await reload(u.id)).teamId).toBeNull();
  });
});

describe("team.ts: تیم فردی عضو تازه نمی‌پذیرد", () => {
  async function soloUser() {
    const u = await makeUser("BUILDER");
    expect((await team.goSolo(u.id)).ok).toBe(true);
    const after = await reload(u.id);
    return { user: u, teamId: after.teamId!, slug: after.team!.slug };
  }

  it("پیوستن با لینک دعوت رد می‌شود", async () => {
    const { slug, teamId } = await soloUser();
    const joiner = await makeUser();
    const res = await team.joinBySlug(joiner.id, slug);
    expect(res.error).toBe(SOLO_CLOSED);
    expect((await reload(joiner.id)).teamId).toBeNull();
    expect(await prisma.user.count({ where: { teamId } })).toBe(1);
  });

  it("شرکت‌کنندهٔ فردی نمی‌تواند دعوت بفرستد", async () => {
    const { user, teamId } = await soloUser();
    const res = await team.inviteToTeam(user.id, "solo-invitee@example.test");
    expect(res.ok).toBeUndefined();
    expect(res.error).toContain("فردی");
    expect(await prisma.teamInvite.count({ where: { teamId } })).toBe(0);
  });

  it("دعوت‌نامهٔ باقی‌مانده به تیم فردی پذیرفته نمی‌شود", async () => {
    const { user, teamId } = await soloUser();
    const invitee = await makeUser();
    const invite = await prisma.teamInvite.create({ data: { teamId, email: invitee.email, inviterId: user.id } });
    const res = await team.acceptInvite(invitee.id, invite.id);
    expect(res.error).toBe(SOLO_CLOSED);
    expect((await reload(invitee.id)).teamId).toBeNull();
  });

  it("هم‌تیم‌سازی خودکار به تیم فردی نمی‌رسد", async () => {
    const { teamId } = await soloUser();
    const seeker = await makeUser("STORYTELLER");
    const res = await team.joinMatchmaking(seeker.id);
    expect(res.ok).toBe(true);
    const after = await reload(seeker.id);
    expect(after.teamId).not.toBeNull();
    expect(after.teamId).not.toBe(teamId);
    expect(after.team?.solo).toBe(false);
    expect(await prisma.user.count({ where: { teamId } })).toBe(1);
  });

  it("هم‌تیم‌سازی خودکار برگزارکننده هم تیم‌های فردی را کنار می‌گذارد", async () => {
    const { teamId } = await soloUser();
    await makeUser("DEALMAKER"); // یک کاربر بی‌تیم دیگر
    await team.autoComposeTeams();
    expect(await prisma.user.count({ where: { teamId } })).toBe(1);
  });

  it("پیش‌نمایش لینک دعوت تیم فردی را پر نشان می‌دهد", async () => {
    const { slug } = await soloUser();
    const preview = await team.getTeamPreviewBySlug(slug);
    expect(preview).toMatchObject({ solo: true, full: true, memberCount: 1 });
  });
});

describe("team.ts: openSoloTeam", () => {
  it("تیم فردی را دوباره باز می‌کند تا هم‌تیمی بپذیرد", async () => {
    const u = await makeUser();
    await team.goSolo(u.id);
    const { teamId, team: t } = await reload(u.id);
    expect(t?.solo).toBe(true);

    const res = await team.openSoloTeam(u.id);
    expect(res.ok).toBe(true);
    expect((await prisma.team.findUniqueOrThrow({ where: { id: teamId! } })).solo).toBe(false);

    const joiner = await makeUser();
    expect((await team.joinBySlug(joiner.id, t!.slug)).ok).toBe(true);
    expect((await reload(joiner.id)).teamId).toBe(teamId);
  });

  it("بدون تیم یا بیرون از بازهٔ تشکیل تیم رد می‌شود", async () => {
    const noTeam = await makeUser();
    expect((await team.openSoloTeam(noTeam.id)).error).toBe("شما عضو هیچ تیمی نیستید.");

    const u = await makeUser();
    await team.goSolo(u.id);
    const res = await inPhase("BUILD", () => team.openSoloTeam(u.id));
    expect(res.error).toBe(PHASE_ERR);
    expect((await reload(u.id)).team?.solo).toBe(true);
  });

  it("انتقال یک کاربر به تیم فردی توسط برگزارکننده، آن تیم را باز می‌کند", async () => {
    const u = await makeUser();
    await team.goSolo(u.id);
    const teamId = (await reload(u.id)).teamId!;
    const moved = await makeUser();
    expect((await team.adminMoveUserToTeam(moved.id, teamId)).ok).toBe(true);
    expect((await prisma.team.findUniqueOrThrow({ where: { id: teamId } })).solo).toBe(false);
  });
});

describe("team-access: بدون سرپرست، هر عضو کارهای تیم را انجام می‌دهد", () => {
  it("کاربر بی‌تیم اجازه ندارد و دلیلش گفته می‌شود", async () => {
    const u = await makeUser();
    const reason = await access.teamManageError({ id: u.id, teamId: null });
    expect(reason).toBeTruthy();
    expect(await access.teamAccess({ id: u.id, teamId: null })).toEqual({ canManage: false, reason });
  });

  it("همهٔ اعضای تیم (نه فقط سازنده) و شرکت‌کنندهٔ فردی اجازه دارند", async () => {
    const { host, slug, teamId } = await hostTeam("تیم بدون سرپرست");
    const second = await makeUser("STORYTELLER");
    const third = await makeUser("DEALMAKER");
    await team.joinBySlug(second.id, slug);
    await team.joinBySlug(third.id, slug);
    for (const m of [host, second, third]) {
      expect(await access.teamManageError({ id: m.id, teamId })).toBeNull();
      expect(await access.teamAccess({ id: m.id, teamId })).toEqual({ canManage: true, reason: null });
    }

    const solo = await makeUser();
    await team.goSolo(solo.id);
    const soloTeamId = (await reload(solo.id)).teamId;
    expect(await access.teamManageError({ id: solo.id, teamId: soloTeamId })).toBeNull();
  });

  it("هر عضو می‌تواند نام تیم را تا پایان اتاق ایده عوض کند", async () => {
    const { slug, teamId } = await hostTeam("تیم تغییر نام");
    const second = await makeUser("STORYTELLER");
    await team.joinBySlug(second.id, slug);

    const res = await teamSettings.updateTeamSettings(second.id, { name: "تیم نام تازه" });
    expect(res.ok).toBe(true);
    const t = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(t.name).toBe("تیم نام تازه");
    expect(t.slug).toBe(slug); // لینک دعوت نمی‌شکند

    const late = await inPhase("SEED_ROUND", () => teamSettings.updateTeamSettings(second.id, { name: "تیم خیلی دیر" }));
    expect(late.error).toBeTruthy();
    expect((await prisma.team.findUniqueOrThrow({ where: { id: teamId } })).name).toBe("تیم نام تازه");
  });

  it("تغییر مهارت فقط یک برچسب است و نقش نامعتبر رد می‌شود", async () => {
    const u = await makeUser("BUILDER");
    expect((await teamSettings.updateSkill(u.id, "STORYTELLER")).ok).toBe(true);
    expect((await reload(u.id)).role).toBe("STORYTELLER");
    expect((await teamSettings.updateSkill(u.id, "HACKER")).error).toBeTruthy();
    expect((await reload(u.id)).role).toBe("STORYTELLER");
  });
});

describe("team.ts: leaveTeam", () => {
  it("آخرین عضو که تیم را ترک کند، تیم حذف می‌شود (فقط در فاز ثبت‌نام)", async () => {
    const { host, teamId } = await hostTeam("تیم ترک‌شونده");
    expect((await team.leaveTeam(host.id)).error).toBe("خروج از تیم فقط در فاز ثبت‌نام و تیم امکان‌پذیر است.");

    const res = await inPhase("REGISTRATION", () => team.leaveTeam(host.id));
    expect(res.ok).toBe(true);
    expect((await reload(host.id)).teamId).toBeNull();
    expect(await prisma.team.findUnique({ where: { id: teamId } })).toBeNull();
  });
});
