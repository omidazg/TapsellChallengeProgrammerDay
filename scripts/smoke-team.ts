/**
 * دود-تست تکمیل/پیوستن به تیم، شرکت فردی (تیم یک‌نفرهٔ بسته) و ابزارهای برگزارکننده.
 * اجرا: npx tsx scripts/smoke-team.ts
 * روی پایگاه‌دادهٔ موقت (createTempDb) اجرا می‌شود؛ dev.db لمس نمی‌شود.
 */
import { createTempDb, isTempDatabaseUrl } from "./lib/temp-db";

// DATABASE_URL باید پیش از import شدن src/lib/db تنظیم شود؛ اگر از قبل به یک
// پایگاه‌دادهٔ موقت اشاره نمی‌کرد (یعنی این اسکریپت مستقل اجرا شده)، اینجا یکی می‌سازیم
// تا هرگز به dev.db واقعی وصل نشویم.
const ownTempDb = isTempDatabaseUrl(process.env.DATABASE_URL) ? null : createTempDb("team");

const TAG = "smoketeam-" + Date.now();
const mail = (n: string) => `${TAG}-${n}@tapsell.ir`;

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { setPhase, getPhase } = await import("../src/lib/phase");
  const { DEFAULTS } = await import("../src/lib/constants");
  const {
    createTeamForUser,
    joinByInviteToken,
    adminMoveUserToTeam,
    adminMergeTeams,
    autoComposeTeams,
    goSolo,
    openSoloTeam,
    joinMatchmaking,
    TEAM_FULL,
  } = await import("../src/lib/team");

  async function makeUser(n: string, role: string) {
    return prisma.user.create({
      data: {
        email: mail(n),
        passwordHash: "x",
        nickname: `کاربر ${n}`,
        role,
        power: "",
        coffee: 5,
        bugs: 50,
        sleep: 7,
        confidence: 100,
        avatarSeed: `seed-${n}`,
        seedWallet: 0,
        buyWallet: DEFAULTS.startingCoins,
      },
    });
  }

  const original = await getPhase();
  const createdTeamIds = new Set<string>();

  try {
    // ---------- joinByInviteToken: موفق، وقتی بخش تیم باز است ----------
    console.log("\n# ۱ — joinByInviteToken وقتی بخش تیم باز است");
    const { setModuleStatus } = await import("../src/lib/module-state");
    await setPhase("LIVE", original.endsAt);

    const h1 = await makeUser("host1", "BUILDER");
    const created1 = await createTeamForUser(h1.id, `تیم ${TAG} ۱`);
    check("ساخت تیم وقتی بخش تیم باز است مجاز است", !!created1.ok, JSON.stringify(created1));
    const host1 = await prisma.user.findUniqueOrThrow({ where: { id: h1.id }, include: { team: true } });
    if (host1.teamId) createdTeamIds.add(host1.teamId);
    const token1 = host1.team!.inviteToken!;

    const j2 = await makeUser("joiner2", "STORYTELLER");
    const joinRes1 = await joinByInviteToken(j2.id, token1);
    check("joinByInviteToken موفق می‌شود", !!joinRes1.ok, JSON.stringify(joinRes1));
    const j2after = await prisma.user.findUniqueOrThrow({ where: { id: j2.id } });
    check("کاربر به تیم درست پیوست", j2after.teamId === host1.teamId);

    const j3 = await makeUser("joiner3", "DEALMAKER");
    const joinRes2 = await joinByInviteToken(j3.id, token1);
    check("نفر سوم هم می‌پیوندد (تیم تکمیل می‌شود)", !!joinRes2.ok, JSON.stringify(joinRes2));

    const memberCount = await prisma.user.count({ where: { teamId: host1.teamId } });
    check("تیم سه‌نفره شد", memberCount === TEAM_FULL, String(memberCount));

    // ---------- joinByInviteToken: تیم پر ----------
    console.log("\n# ۲ — joinByInviteToken با تیم پر");
    const j4 = await makeUser("joiner4", "BUILDER");
    const joinFull = await joinByInviteToken(j4.id, token1);
    check("پیوستن به تیم پر رد می‌شود", !joinFull.ok && !!joinFull.error, JSON.stringify(joinFull));

    // ---------- joinByInviteToken: لینک نامعتبر ----------
    const joinGhost = await joinByInviteToken(j4.id, "این-اسلاگ-وجود-ندارد");
    check("لینک نامعتبر رد می‌شود", !joinGhost.ok && !!joinGhost.error, JSON.stringify(joinGhost));

    // ---------- joinByInviteToken: خارج از فاز مجاز ----------
    console.log("\n# ۳ — joinByInviteToken وقتی بخش تیم بسته است");
    const h2 = await makeUser("host2", "BUILDER");
    const created2 = await createTeamForUser(h2.id, `تیم ${TAG} ۲`);
    check("ساخت تیم دوم موفق", !!created2.ok, JSON.stringify(created2));
    const host2 = await prisma.user.findUniqueOrThrow({ where: { id: h2.id }, include: { team: true } });
    if (host2.teamId) createdTeamIds.add(host2.teamId);
    const token2 = host2.team!.inviteToken!;

    await setModuleStatus("team", "closed");
    const joinLatePhase = await joinByInviteToken(j4.id, token2);
    check(
      "پیوستن وقتی بخش تیم بسته است رد می‌شود",
      !joinLatePhase.ok && joinLatePhase.error === "بخش تیم فعلاً باز نیست.",
      JSON.stringify(joinLatePhase)
    );
    await setModuleStatus("team", "open");

    // ---------- ادغام تیم‌ها: موفق ----------
    console.log("\n# ۴ — ادغام تیم‌ها (موفق)");
    const mA = await makeUser("mergeA", "BUILDER");
    const mB = await makeUser("mergeB", "STORYTELLER");
    const createdA = await createTeamForUser(mA.id, `تیم ${TAG} ادغام‌A`);
    const createdB = await createTeamForUser(mB.id, `تیم ${TAG} ادغام‌B`);
    check("دو تیم برای ادغام ساخته شدند", !!createdA.ok && !!createdB.ok);
    const userA = await prisma.user.findUniqueOrThrow({ where: { id: mA.id } });
    const userB = await prisma.user.findUniqueOrThrow({ where: { id: mB.id } });
    createdTeamIds.add(userA.teamId!);
    createdTeamIds.add(userB.teamId!);

    const mergeOk = await adminMergeTeams(userA.teamId!, userB.teamId!);
    check("ادغام موفق", !!mergeOk.ok, JSON.stringify(mergeOk));
    const userBAfter = await prisma.user.findUniqueOrThrow({ where: { id: mB.id } });
    check("عضو تیم B به تیم A منتقل شد", userBAfter.teamId === userA.teamId);
    const teamBGone = await prisma.team.findUnique({ where: { id: userB.teamId! } });
    check("تیم B حذف شد", teamBGone === null);
    createdTeamIds.delete(userB.teamId!);

    // ---------- ادغام تیم‌ها: رد به‌دلیل ظرفیت ----------
    console.log("\n# ۵ — ادغام تیم‌ها (رد — ظرفیت ناکافی)");
    // تیم A الان دو عضو دارد (mA, mB)؛ یک تیم سه‌نفره برای رد ادغام می‌سازیم
    const cFull = await prisma.team.create({ data: { name: `تیم ${TAG} پر`, slug: `${TAG}-full` } });
    createdTeamIds.add(cFull.id);
    const fullMembers = await Promise.all([makeUser("fullc1", "BUILDER"), makeUser("fullc2", "STORYTELLER"), makeUser("fullc3", "DEALMAKER")]);
    await prisma.user.updateMany({ where: { id: { in: fullMembers.map((u) => u.id) } }, data: { teamId: cFull.id } });

    const mergeCapacityRefused = await adminMergeTeams(userA.teamId!, cFull.id);
    check(
      "ادغام با مجموع اعضای بیش از ظرفیت رد می‌شود",
      !mergeCapacityRefused.ok && !!mergeCapacityRefused.error,
      JSON.stringify(mergeCapacityRefused)
    );

    // ---------- ادغام تیم‌ها: رد به‌دلیل ایده/محصول ----------
    console.log("\n# ۶ — ادغام تیم‌ها (رد — تیم دوم ایده دارد)");
    const ideaTeam = await prisma.team.create({ data: { name: `تیم ${TAG} باایده`, slug: `${TAG}-idea` } });
    createdTeamIds.add(ideaTeam.id);
    const ideaUser = await makeUser("ideauser", "BUILDER");
    await prisma.user.update({ where: { id: ideaUser.id }, data: { teamId: ideaTeam.id } });
    const idea = await prisma.idea.create({
      data: {
        teamId: ideaTeam.id,
        title: "ایدهٔ آزمون",
        oneLiner: "یک جمله",
        problem: "مسئله",
        audience: "مخاطب",
        buildPlan: "برنامه",
        fundingCap: 0,
        revenueShare: 0,
      },
    });

    const mergeIdeaRefused = await adminMergeTeams(userA.teamId!, ideaTeam.id);
    check(
      "ادغام تیمی که ایده ثبت کرده رد می‌شود",
      !mergeIdeaRefused.ok && !!mergeIdeaRefused.error,
      JSON.stringify(mergeIdeaRefused)
    );
    await prisma.idea.delete({ where: { id: idea.id } });

    // ---------- adminMoveUserToTeam ----------
    console.log("\n# ۷ — انتقال کاربر توسط برگزارکننده");
    const moveTarget = await prisma.team.create({ data: { name: `تیم ${TAG} مقصد`, slug: `${TAG}-dest` } });
    createdTeamIds.add(moveTarget.id);
    const moveUser = await makeUser("moveuser", "BUILDER");
    const moveOk = await adminMoveUserToTeam(moveUser.id, moveTarget.id);
    check("انتقال کاربر بی‌تیم موفق است", !!moveOk.ok, JSON.stringify(moveOk));
    const moveUserAfter = await prisma.user.findUniqueOrThrow({ where: { id: moveUser.id } });
    check("کاربر در تیم مقصد قرار گرفت", moveUserAfter.teamId === moveTarget.id);

    const moveFullRefused = await adminMoveUserToTeam(ideaUser.id, cFull.id);
    check("انتقال به تیم پر رد می‌شود", !moveFullRefused.ok && !!moveFullRefused.error, JSON.stringify(moveFullRefused));

    // ---------- شرکت فردی ----------
    console.log("\n# ۸ — شرکت فردی (تیم یک‌نفرهٔ بسته)");
    const soloUser = await makeUser("solo1", "BUILDER");
    const soloRes = await goSolo(soloUser.id);
    check("goSolo برای کاربر بی‌تیم موفق است", !!soloRes.ok, JSON.stringify(soloRes));
    const soloAfter = await prisma.user.findUniqueOrThrow({ where: { id: soloUser.id }, include: { team: true } });
    const soloTeam = soloAfter.team!;
    createdTeamIds.add(soloTeam.id);
    check("تیم فردی ساخته شد و solo=true است", !!soloTeam && soloTeam.solo === true, JSON.stringify(soloTeam));
    check("نام تیم فردی همان نام مستعار کاربر است", soloTeam.name === soloUser.nickname, soloTeam.name);
    check("goSolo دوباره روی همان تیم یک‌نفره هم موفق است (idempotent)", !!(await goSolo(soloUser.id)).ok);

    const soloSeeker = await makeUser("soloSeeker", "STORYTELLER");
    const joinSolo = await joinByInviteToken(soloSeeker.id, soloTeam.inviteToken!);
    check("پیوستن با لینک به تیم فردی رد می‌شود", !joinSolo.ok && !!joinSolo.error?.includes("فردی"), JSON.stringify(joinSolo));
    const mm = await joinMatchmaking(soloSeeker.id);
    const seekerAfter = await prisma.user.findUniqueOrThrow({ where: { id: soloSeeker.id } });
    if (seekerAfter.teamId) createdTeamIds.add(seekerAfter.teamId);
    check("هم‌تیم‌سازی، کاربر را به تیم فردی نمی‌فرستد", !!mm.ok && !!seekerAfter.teamId && seekerAfter.teamId !== soloTeam.id, JSON.stringify(mm));

    const mates = await goSolo(h1.id);
    check("goSolo برای تیم چندنفره رد می‌شود", !mates.ok && !!mates.error?.includes("عضو دیگری"), JSON.stringify(mates));
    check("تیم چندنفره solo نشد", (await prisma.team.findUniqueOrThrow({ where: { id: host1.teamId! } })).solo === false);

    // عضو تنهای یک تیم معمولی: goSolo همان تیم را می‌بندد و دعوت‌های در انتظار را رد می‌کند
    const lone = await makeUser("lone", "DEALMAKER");
    await createTeamForUser(lone.id, `تیم ${TAG} تنها`);
    const loneTeamId = (await prisma.user.findUniqueOrThrow({ where: { id: lone.id } })).teamId!;
    createdTeamIds.add(loneTeamId);
    const invite = await prisma.teamInvite.create({ data: { teamId: loneTeamId, email: mail("invited"), inviterId: lone.id } });
    const loneSolo = await goSolo(lone.id);
    check("goSolo برای عضو تنهای تیم معمولی موفق است", !!loneSolo.ok, JSON.stringify(loneSolo));
    check("همان تیم بسته شد (solo=true)", (await prisma.team.findUniqueOrThrow({ where: { id: loneTeamId } })).solo === true);
    check("دعوت در انتظار آن تیم رد شد", (await prisma.teamInvite.findUniqueOrThrow({ where: { id: invite.id } })).status === "DECLINED");

    const reopened = await openSoloTeam(soloUser.id);
    check("openSoloTeam تیم فردی را دوباره باز می‌کند", !!reopened.ok && (await prisma.team.findUniqueOrThrow({ where: { id: soloTeam.id } })).solo === false, JSON.stringify(reopened));
    const lateJoiner = await makeUser("lateJoiner", "STORYTELLER");
    const joinReopened = await joinByInviteToken(lateJoiner.id, soloTeam.inviteToken!);
    check("پس از بازگشایی، پیوستن با لینک ممکن است", !!joinReopened.ok, JSON.stringify(joinReopened));
    check("حالا که هم‌تیمی دارد goSolo رد می‌شود", !(await goSolo(soloUser.id)).ok);
    const strayUser = await makeUser("stray", "BUILDER");
    check("openSoloTeam برای کاربر بی‌تیم رد می‌شود", !(await openSoloTeam(strayUser.id)).ok);

    const moveIntoSolo = await adminMoveUserToTeam(strayUser.id, loneTeamId);
    check("برگزارکننده می‌تواند کاربر را به تیم فردی منتقل کند", !!moveIntoSolo.ok, JSON.stringify(moveIntoSolo));
    check("پس از انتقال، تیم دیگر فردی نیست (solo=false)", (await prisma.team.findUniqueOrThrow({ where: { id: loneTeamId } })).solo === false);

    // تیم فردی تازه برای آزمون هم‌تیم‌سازی خودکار
    const soloKeeper = await makeUser("soloKeeper", "STORYTELLER");
    await goSolo(soloKeeper.id);
    const keeperTeamId = (await prisma.user.findUniqueOrThrow({ where: { id: soloKeeper.id } })).teamId!;
    createdTeamIds.add(keeperTeamId);

    await setModuleStatus("team", "closed");
    const lateSolo = await goSolo(strayUser.id);
    check("goSolo وقتی بخش تیم بسته است رد می‌شود", !lateSolo.ok && lateSolo.error === "بخش تیم فعلاً باز نیست.", JSON.stringify(lateSolo));
    await setModuleStatus("team", "open");

    // ---------- autoComposeTeams ----------
    console.log("\n# ۹ — تشکیل خودکار تیم‌ها");
    const tl1 = await makeUser("teamless1", "DEALMAKER"); // باید به moveTarget (دارد BUILDER، کم دارد DEALMAKER) ملحق شود ترجیحاً
    const tl2 = await makeUser("teamless2", "BUILDER");
    const tl3 = await makeUser("teamless3", "STORYTELLER");
    const tl4 = await makeUser("teamless4", "DEALMAKER");

    const summary = await autoComposeTeams();
    check("همهٔ کاربران بی‌تیم جا‌به‌جا شدند", summary.remainingTeamless === 0, JSON.stringify(summary));
    const assignedIds = new Set(summary.assigned.map((a) => a.userId));
    check(
      "هر چهار کاربر بی‌تیم در خلاصه هستند",
      [tl1, tl2, tl3, tl4].every((u) => assignedIds.has(u.id)),
      JSON.stringify(summary.assigned.map((a) => a.nickname))
    );

    for (const a of summary.assigned) {
      if (a.createdNewTeam) createdTeamIds.add(a.teamId);
    }

    // الگوریتم ترجیحاً نیمه‌کاره‌ترین تیمی که نقش کاربر را ندارد انتخاب می‌کند؛
    // اینجا فقط عضویت واقعی در یک تیم معتبر را تأیید می‌کنیم (جای دقیق به سیاست داخلی الگوریتم بستگی دارد).
    const tl1After = await prisma.user.findUniqueOrThrow({ where: { id: tl1.id } });
    const tl1Team = tl1After.teamId
      ? await prisma.team.findUnique({ where: { id: tl1After.teamId }, include: { members: { select: { role: true } } } })
      : null;
    check(
      "کاربر بی‌تیم DEALMAKER به یک تیم واقعی (با جای خالی کافی) ملحق شد",
      !!tl1Team && tl1Team.members.length <= TEAM_FULL,
      JSON.stringify({ teamId: tl1After.teamId, roles: tl1Team?.members.map((m) => m.role) })
    );

    // هیچ تیمی نباید از سقف سه‌نفره عبور کرده باشد
    const allTeamsAfter = await prisma.team.findMany({ where: { id: { in: [...createdTeamIds] } }, include: { members: true } });
    check("هیچ تیمی از سقف سه‌نفره عبور نکرد", allTeamsAfter.every((t) => t.members.length <= TEAM_FULL));
    check("autoComposeTeams به تیم فردی دست نزد", !summary.assigned.some((a) => a.teamId === keeperTeamId));
    const keeperTeam = await prisma.team.findUniqueOrThrow({ where: { id: keeperTeamId }, include: { members: true } });
    check("تیم فردی همچنان یک‌نفره و بسته است", keeperTeam.solo && keeperTeam.members.length === 1, JSON.stringify({ solo: keeperTeam.solo, n: keeperTeam.members.length }));

    const teamlessAfter = await prisma.user.count({ where: { email: { startsWith: TAG }, teamId: null } });
    check("هیچ کاربر بی‌تیمی از این آزمون باقی نماند", teamlessAfter === 0, String(teamlessAfter));
  } finally {
    console.log("\n# پاک‌سازی");
    const users = await prisma.user.findMany({ where: { email: { startsWith: TAG } }, select: { id: true, teamId: true } });
    for (const u of users) if (u.teamId) createdTeamIds.add(u.teamId);
    await prisma.idea.deleteMany({ where: { teamId: { in: [...createdTeamIds] } } });
    await prisma.teamInvite.deleteMany({ where: { teamId: { in: [...createdTeamIds] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await prisma.user.updateMany({ where: { id: { in: users.map((u) => u.id) } }, data: { teamId: null } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await prisma.team.deleteMany({ where: { id: { in: [...createdTeamIds] } } });
    await setPhase(original.phase, original.endsAt);
    const leftUsers = await prisma.user.count({ where: { email: { startsWith: TAG } } });
    const leftTeams = await prisma.team.count({ where: { id: { in: [...createdTeamIds] } } });
    console.log(`  کاربر باقی‌مانده: ${leftUsers} — تیم باقی‌مانده: ${leftTeams} — فاز بازگردانده‌شده: ${original.phase}`);
    console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
  }
  await prisma.$disconnect();
  return fail;
}

main()
  .then((fail) => {
    ownTempDb?.cleanup();
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    ownTempDb?.cleanup();
    process.exit(1);
  });
