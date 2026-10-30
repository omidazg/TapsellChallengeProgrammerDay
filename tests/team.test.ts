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
const CLOSED_ERR = "بخش تیم فعلاً باز نیست.";

beforeAll(async () => {
  db = createTempDb("team-test");
  ({ prisma } = await import("../src/lib/db"));
  team = await import("../src/lib/team");
  phase = await import("../src/lib/phase");
  access = await import("../src/lib/team-access");
  teamSettings = await import("../src/lib/team-settings");
  await phase.setPhase("LIVE", null);
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
  return { host, teamId: after.teamId!, slug: after.team!.slug, token: after.team!.inviteToken! };
}

/** با وضعیت موقت بخش «تیم» اجرا می‌کند و در پایان آن را به پیش‌فرض (باز) برمی‌گرداند */
async function withTeamModule<T>(status: string, fn: () => Promise<T>): Promise<T> {
  await prisma.setting.upsert({ where: { key: "module_team" }, update: { value: status }, create: { key: "module_team", value: status } });
  try {
    return await fn();
  } finally {
    await prisma.setting.deleteMany({ where: { key: "module_team" } });
  }
}

/** محصول تیم در یک محور (پیش‌فرض ثبت‌نهایی‌شده) */
async function makeProduct(teamId: string, trackId = "general", submitted = true) {
  counter++;
  return prisma.product.create({
    data: { teamId, trackId, slug: `team-product-${counter}-${trackId}`, name: `محصول ${counter}`, submittedAt: submitted ? new Date() : null },
  });
}

async function makeIdea(teamId: string, trackId = "general") {
  return prisma.idea.create({
    data: { teamId, trackId, title: "ایده", oneLiner: "x", problem: "x", audience: "x", buildPlan: "x", fundingCap: 0, revenueShare: 0, submittedAt: new Date() },
  });
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

  it("rejects team creation while the team module is not open", async () => {
    const u = await makeUser();
    const res = await withTeamModule("closed", () => team.createTeamForUser(u.id, "تیم دیرهنگام"));
    expect(res.ok).toBeUndefined();
    expect(res.error).toBe(CLOSED_ERR);
  });
});

describe("team.ts: joinByInviteToken (invite limits)", () => {
  it("lets members join up to the team cap (3)", async () => {
    const { teamId, token } = await hostTeam("تیم پیوستن");
    expect((await team.joinByInviteToken((await makeUser("STORYTELLER")).id, token)).ok).toBe(true);
    expect((await team.joinByInviteToken((await makeUser("DEALMAKER")).id, token)).ok).toBe(true);
    expect(await prisma.user.count({ where: { teamId } })).toBe(team.TEAM_FULL);
    expect(team.TEAM_FULL).toBe(3);
  });

  it("rejects joining once the team is full", async () => {
    const { token } = await hostTeam("تیم پر می‌شود");
    await team.joinByInviteToken((await makeUser("STORYTELLER")).id, token);
    await team.joinByInviteToken((await makeUser("DEALMAKER")).id, token);
    const r4 = await team.joinByInviteToken((await makeUser()).id, token);
    expect(r4.ok).toBeUndefined();
    expect(r4.error).toBe("این تیم پر شده است.");
  });

  it("a team of two is a valid team (members may share the same skill)", async () => {
    const { teamId, token } = await hostTeam("تیم دونفره");
    const r = await team.joinByInviteToken((await makeUser("BUILDER")).id, token);
    expect(r.ok).toBe(true);
    expect(await prisma.user.count({ where: { teamId } })).toBe(2);
  });

  it("rejects joining with an unknown invite token", async () => {
    const u = await makeUser();
    const res = await team.joinByInviteToken(u.id, "no-such-team-slug-ever");
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
    const { host, token } = await hostTeam("تیم دعوت پر");
    await team.joinByInviteToken((await makeUser("STORYTELLER")).id, token);
    await team.joinByInviteToken((await makeUser("DEALMAKER")).id, token);
    const res = await team.inviteToTeam(host.id, "someone-else@example.test");
    expect(res.error).toBe("تیم پر است؛ ظرفیت هر تیم سه نفر است.");
  });

  it("any member (not only the creator) can invite", async () => {
    const { token, teamId } = await hostTeam("تیم دعوت عضو دوم");
    const second = await makeUser("STORYTELLER");
    await team.joinByInviteToken(second.id, token);
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
    const { host, token, teamId } = await hostTeam("تیم دونفره نه‌فردی");
    await team.joinByInviteToken((await makeUser()).id, token);
    const res = await team.goSolo(host.id);
    expect(res.error).toBe("تیمت عضو دیگری دارد؛ شرکت فردی فقط برای تیم یک‌نفره است.");
    expect((await prisma.team.findUniqueOrThrow({ where: { id: teamId } })).solo).toBe(false);
  });

  it("وقتی بخش تیم باز نیست رد می‌شود", async () => {
    const u = await makeUser();
    const res = await withTeamModule("ro", () => team.goSolo(u.id));
    expect(res.error).toBe(CLOSED_ERR);
    expect((await reload(u.id)).teamId).toBeNull();
  });
});

describe("team.ts: تیم فردی عضو تازه نمی‌پذیرد", () => {
  async function soloUser() {
    const u = await makeUser("BUILDER");
    expect((await team.goSolo(u.id)).ok).toBe(true);
    const after = await reload(u.id);
    return { user: u, teamId: after.teamId!, slug: after.team!.slug, token: after.team!.inviteToken! };
  }

  it("پیوستن با لینک دعوت رد می‌شود", async () => {
    const { token, teamId } = await soloUser();
    const joiner = await makeUser();
    const res = await team.joinByInviteToken(joiner.id, token);
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
    const { token } = await soloUser();
    const preview = await team.getTeamPreviewByInviteToken(token);
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
    expect((await team.joinByInviteToken(joiner.id, t!.inviteToken!)).ok).toBe(true);
    expect((await reload(joiner.id)).teamId).toBe(teamId);
  });

  it("بدون تیم یا وقتی بخش تیم باز نیست رد می‌شود", async () => {
    const noTeam = await makeUser();
    expect((await team.openSoloTeam(noTeam.id)).error).toBe("تو عضو هیچ تیمی نیستی.");

    const u = await makeUser();
    await team.goSolo(u.id);
    const res = await withTeamModule("closed", () => team.openSoloTeam(u.id));
    expect(res.error).toBe(CLOSED_ERR);
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
    const { host, token, teamId } = await hostTeam("تیم بدون سرپرست");
    const second = await makeUser("STORYTELLER");
    const third = await makeUser("DEALMAKER");
    await team.joinByInviteToken(second.id, token);
    await team.joinByInviteToken(third.id, token);
    for (const m of [host, second, third]) {
      expect(await access.teamManageError({ id: m.id, teamId })).toBeNull();
      expect(await access.teamAccess({ id: m.id, teamId })).toEqual({ canManage: true, reason: null });
    }

    const solo = await makeUser();
    await team.goSolo(solo.id);
    const soloTeamId = (await reload(solo.id)).teamId;
    expect(await access.teamManageError({ id: solo.id, teamId: soloTeamId })).toBeNull();
  });

  it("هر عضو می‌تواند نام تیم را تا وقتی بخش تیم باز است عوض کند", async () => {
    const { slug, token, teamId } = await hostTeam("تیم تغییر نام");
    const second = await makeUser("STORYTELLER");
    await team.joinByInviteToken(second.id, token);

    const res = await teamSettings.updateTeamSettings(second.id, { name: "تیم نام تازه" });
    expect(res.ok).toBe(true);
    const t = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(t.name).toBe("تیم نام تازه");
    expect(t.slug).toBe(slug); // لینک بازار نمی‌شکند
    expect(t.inviteToken).toBe(token); // لینک دعوت هم نمی‌شکند

    const late = await withTeamModule("ro", () => teamSettings.updateTeamSettings(second.id, { name: "تیم خیلی دیر" }));
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
  it("آخرین عضو که تیم را ترک کند، تیم حذف می‌شود (فقط وقتی بخش تیم باز است)", async () => {
    const { host, teamId } = await hostTeam("تیم ترک‌شونده");
    const closed = await withTeamModule("closed", () => team.leaveTeam(host.id));
    expect(closed.ok).toBeUndefined();
    expect(closed.error).toBeTruthy();
    expect((await reload(host.id)).teamId).toBe(teamId);

    const res = await team.leaveTeam(host.id);
    expect(res.ok).toBe(true);
    expect((await reload(host.id)).teamId).toBeNull();
    expect(await prisma.team.findUnique({ where: { id: teamId } })).toBeNull();
  });

  it("تیم با ایده یا پیش‌نویس محصول: عضو می‌تواند برود ولی آخرین عضو نه (تیم بی‌صاحب نمی‌ماند)", async () => {
    const { host, teamId, token } = await hostTeam("تیم با ایده");
    const mate = await makeUser();
    await team.joinByInviteToken(mate.id, token);
    await makeIdea(teamId);
    await makeProduct(teamId, "general", false);

    expect((await team.leaveTeam(mate.id)).ok).toBe(true);
    const last = await team.leaveTeam(host.id);
    expect(last.ok).toBeUndefined();
    expect(last.error).toBeTruthy();
    expect((await reload(host.id)).teamId).toBe(teamId);
  });
});

describe("team.ts: قفل اعضا پس از ثبت نهایی محصول", () => {
  const LOCKED = "این تیم محصولش را ثبت نهایی کرده و اعضایش دیگر عوض نمی‌شوند.";

  it("پیش از ثبت نهایی اعضا آزادانه عوض می‌شوند؛ پیش‌نویس محصول قفل نمی‌کند", async () => {
    const { teamId, token } = await hostTeam("تیم پیش‌نویس");
    await makeProduct(teamId, "general", false);
    const joiner = await makeUser();
    expect((await team.joinByInviteToken(joiner.id, token)).ok).toBe(true);
    expect((await team.leaveTeam(joiner.id)).ok).toBe(true);
  });

  it("پس از ثبت نهایی: ترک تیم، پیوستن با لینک، پذیرش دعوت و دعوت تازه رد می‌شوند", async () => {
    const { host, teamId, token } = await hostTeam("تیم قفل");
    const mate = await makeUser();
    await team.joinByInviteToken(mate.id, token);
    const invitee = await makeUser();
    expect((await team.inviteToTeam(host.id, invitee.email)).ok).toBe(true);
    const invite = await prisma.teamInvite.findFirstOrThrow({ where: { teamId, email: invitee.email } });

    await makeProduct(teamId);

    expect((await team.leaveTeam(mate.id)).error).toBeTruthy();
    expect((await reload(mate.id)).teamId).toBe(teamId);

    const joiner = await makeUser();
    expect((await team.joinByInviteToken(joiner.id, token)).error).toBe(LOCKED);
    expect((await reload(joiner.id)).teamId).toBeNull();

    expect((await team.acceptInvite(invitee.id, invite.id)).error).toBe(LOCKED);
    expect((await reload(invitee.id)).teamId).toBeNull();
    expect((await prisma.teamInvite.findUniqueOrThrow({ where: { id: invite.id } })).status).toBe("PENDING");

    expect((await team.inviteToTeam(host.id, "late-invite@example.test")).error).toBe(LOCKED);
  });

  it("ثبت نهایی در هر محوری قفل می‌کند، و بازکردن محصول برای ویرایش قفل را برمی‌دارد", async () => {
    const { teamId, token } = await hostTeam("تیم چندمحوره");
    await makeProduct(teamId, "general", false);
    const content = await makeProduct(teamId, "content", true);
    const joiner = await makeUser();
    expect((await team.joinByInviteToken(joiner.id, token)).error).toBe(LOCKED);

    await prisma.product.update({ where: { id: content.id }, data: { submittedAt: null } });
    expect((await team.joinByInviteToken(joiner.id, token)).ok).toBe(true);
  });

  it("هم‌تیم‌سازی خودکار به تیم قفل‌شده نمی‌رسد", async () => {
    const { teamId } = await hostTeam("تیم قفل هم‌تیم‌سازی");
    await makeProduct(teamId);
    const joiner = await makeUser();
    expect((await team.joinMatchmaking(joiner.id)).ok).toBe(true);
    expect((await reload(joiner.id)).teamId).not.toBe(teamId);
  });
});

describe("team.ts: استثنای بخش تیم برای یک تیم", () => {
  it("بخش بسته است ولی تیم دارای استثنا می‌تواند دعوت کند و عضو بپذیرد؛ تیم دیگر نه", async () => {
    const special = await hostTeam("تیم استثنا");
    const plain = await hostTeam("تیم بدون استثنا");
    await prisma.moduleException.create({ data: { moduleKey: "team", teamId: special.teamId, createdBy: "test" } });
    const joiner = await makeUser();
    const other = await makeUser();
    try {
      await withTeamModule("closed", async () => {
        expect((await team.inviteToTeam(special.host.id, "exception-invite@example.test")).ok).toBe(true);
        expect((await team.inviteToTeam(plain.host.id, "no-exception-invite@example.test")).error).toBe(CLOSED_ERR);

        expect((await team.joinByInviteToken(other.id, plain.token)).error).toBe(CLOSED_ERR);
        expect((await reload(other.id)).teamId).toBeNull();

        expect((await team.joinByInviteToken(joiner.id, special.token)).ok).toBe(true);
        expect((await reload(joiner.id)).teamId).toBe(special.teamId);
      });
    } finally {
      await prisma.moduleException.deleteMany({ where: { teamId: special.teamId } });
    }
  });

  it("پذیرش دعوت هم با استثنای تیم مقصد سنجیده می‌شود", async () => {
    const special = await hostTeam("تیم استثنای دعوت");
    const invitee = await makeUser();
    expect((await team.inviteToTeam(special.host.id, invitee.email)).ok).toBe(true);
    const invite = await prisma.teamInvite.findFirstOrThrow({ where: { teamId: special.teamId, email: invitee.email } });
    await withTeamModule("closed", async () => {
      expect((await team.acceptInvite(invitee.id, invite.id)).error).toBe(CLOSED_ERR);
      await prisma.moduleException.create({ data: { moduleKey: "team", teamId: special.teamId, createdBy: "test" } });
      expect((await team.acceptInvite(invitee.id, invite.id)).ok).toBe(true);
    });
    await prisma.moduleException.deleteMany({ where: { teamId: special.teamId } });
  });
});

describe("team.ts: لینک دعوت با توکن تصادفی", () => {
  it("هر تیم تازه توکن دعوت یکتا و غیرقابل‌حدس دارد که با اسلاگ فرق می‌کند", async () => {
    const a = await hostTeam("تیم توکن الف");
    const b = await hostTeam("تیم توکن ب");
    expect(a.token).toBeTruthy();
    expect(a.token.length).toBeGreaterThanOrEqual(32);
    expect(a.token).not.toBe(a.slug);
    expect(a.token).not.toBe(b.token);
  });

  it("اسلاگ عمومی تیم برای پیوستن کافی نیست", async () => {
    const { teamId, slug } = await hostTeam("تیم اسلاگ عمومی");
    const joiner = await makeUser();
    const res = await team.joinByInviteToken(joiner.id, slug);
    expect(res.error).toBe("تیمی با این لینک پیدا نشد.");
    expect((await reload(joiner.id)).teamId).toBeNull();
    expect(await team.getTeamPreviewByInviteToken(slug)).toBeNull();
    expect(await prisma.user.count({ where: { teamId } })).toBe(1);
  });

  it("پیش‌نمایش لینک دعوت خود توکن را برنمی‌گرداند", async () => {
    const { token } = await hostTeam("تیم پیش‌نمایش");
    const preview = await team.getTeamPreviewByInviteToken(token);
    expect(preview?.name).toBe("تیم پیش‌نمایش");
    expect(JSON.stringify(preview)).not.toContain(token);
  });

  it("ساخت لینک تازه لینک قبلی را باطل می‌کند", async () => {
    const { host, teamId, token } = await hostTeam("تیم لینک تازه");
    expect((await team.regenerateInviteToken(host.id)).ok).toBe(true);
    const fresh = (await prisma.team.findUniqueOrThrow({ where: { id: teamId } })).inviteToken!;
    expect(fresh).not.toBe(token);

    const old = await team.joinByInviteToken((await makeUser()).id, token);
    expect(old.error).toBe("تیمی با این لینک پیدا نشد.");
    const ok = await team.joinByInviteToken((await makeUser()).id, fresh);
    expect(ok.ok).toBe(true);
  });

  it("کاربر بی‌تیم نمی‌تواند لینک تازه بسازد", async () => {
    const u = await makeUser();
    expect((await team.regenerateInviteToken(u.id)).error).toBe("تو عضو هیچ تیمی نیستی.");
  });

  it("getTeamWithMembers هش رمز و ایمیل اعضا را برنمی‌گرداند ولی توکن را دارد", async () => {
    const { teamId, token } = await hostTeam("تیم دادهٔ امن");
    const t = await team.getTeamWithMembers(teamId);
    expect(t?.inviteToken).toBe(token);
    const member = t!.members[0] as Record<string, unknown>;
    expect(member.passwordHash).toBeUndefined();
    expect(member.email).toBeUndefined();
    expect(member.phone).toBeUndefined();
  });

  it("تیم قدیمی بدون توکن هنگام باز شدن اتاق تیم توکن می‌گیرد", async () => {
    const { teamId } = await hostTeam("تیم بی‌توکن");
    await prisma.team.update({ where: { id: teamId }, data: { inviteToken: null } });
    const t = await team.getTeamWithMembers(teamId);
    expect(t?.inviteToken).toBeTruthy();
    expect((await prisma.team.findUniqueOrThrow({ where: { id: teamId } })).inviteToken).toBe(t?.inviteToken);
  });
});

describe("team.ts: adminMoveUserToTeam", () => {
  it("تیم مبدأ خالیِ بی‌ایده پس از انتقال حذف می‌شود", async () => {
    const { host: mover, teamId: sourceId } = await hostTeam("تیم مبدأ خالی‌شونده");
    const { teamId: targetId } = await hostTeam("تیم مقصد انتقال");
    const res = await team.adminMoveUserToTeam(mover.id, targetId);
    expect(res.ok).toBe(true);
    expect((await reload(mover.id)).teamId).toBe(targetId);
    expect(await prisma.team.findUnique({ where: { id: sourceId } })).toBeNull();
  });

  it("تیم مبدأ که هنوز عضو دارد می‌ماند", async () => {
    const { host, teamId: sourceId, token } = await hostTeam("تیم مبدأ پرجمعیت");
    const mate = await makeUser("STORYTELLER");
    await team.joinByInviteToken(mate.id, token);
    const { teamId: targetId } = await hostTeam("تیم مقصد دوم");
    expect((await team.adminMoveUserToTeam(host.id, targetId)).ok).toBe(true);
    expect(await prisma.team.findUnique({ where: { id: sourceId } })).not.toBeNull();
    expect(await prisma.user.count({ where: { teamId: sourceId } })).toBe(1);
  });
});

describe("team.ts: goSolo هم‌زمان با پیوستن", () => {
  it("هرگز تیم فردیِ دونفره نمی‌سازد", async () => {
    for (let i = 0; i < 5; i++) {
      const { host, teamId, token } = await hostTeam(`تیم مسابقهٔ فردی ${i}`);
      const joiner = await makeUser();
      await Promise.all([team.goSolo(host.id), team.joinByInviteToken(joiner.id, token)]);
      const t = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
      const members = await prisma.user.count({ where: { teamId } });
      expect(t.solo ? members === 1 : members === 2).toBe(true);
    }
  });
});
