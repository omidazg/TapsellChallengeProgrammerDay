/**
 * دود-تست ثبت‌نام/ورود/تیم — مسیرهای واقعی src/lib/team.ts را اجرا می‌کند.
 * اجرا: npx tsx scripts/smoke-auth.ts
 * همهٔ ردیف‌های ساخته‌شده در پایان پاک می‌شوند.
 */
import "dotenv/config";
import { createTempDb, isTempDatabaseUrl } from "./lib/temp-db";

// DATABASE_URL باید پیش از import شدن src/lib/db تنظیم شود؛ اگر از قبل به یک
// پایگاه‌دادهٔ موقت اشاره نمی‌کرد، اینجا یکی می‌سازیم تا هرگز به dev.db وصل نشویم.
const ownTempDb = isTempDatabaseUrl(process.env.DATABASE_URL) ? null : createTempDb("auth");

const TAG = "smoke-" + Date.now();
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
  const { hashPassword, verifyPassword } = await import("../src/lib/auth");
  const { getSettingInt, setPhase, getPhase } = await import("../src/lib/phase");
  const { DEFAULTS } = await import("../src/lib/constants");
  const {
    createTeamForUser,
    joinMatchmaking,
    inviteToTeam,
    acceptInvite,
    declineInvite,
    leaveTeam,
    slugify,
  } = await import("../src/lib/team");

  async function makeUser(n: string, role: string, power: string) {
    const [seedWallet, buyWallet] = await Promise.all([
      getSettingInt("seed_wallet", DEFAULTS.seedWallet),
      getSettingInt("buy_wallet", DEFAULTS.buyWallet),
    ]);
    const nickname = `آزمون ${n}`;
    const stats = { coffee: 5, bugs: 50, sleep: 7, confidence: 100 };
    const avatarSeed = `${role}-${power}-${stats.coffee}-${stats.bugs}-${stats.sleep}-${stats.confidence}-${nickname}`;
    return prisma.user.create({
      data: {
        email: mail(n),
        passwordHash: await hashPassword("secret123"),
        nickname,
        department: "بک‌اند",
        role,
        power,
        ...stats,
        avatarSeed,
        seedWallet,
        buyWallet,
      },
    });
  }

  const original = await getPhase();
  const createdTeamIds = new Set<string>();

  try {
    await setPhase("REGISTRATION", original.endsAt);

    console.log("\n# ۱ — ساخت کاربر و رمز");
    const u1 = await makeUser("a", "BUILDER", "HYPE");
    const u2 = await makeUser("b", "STORYTELLER", "BARGAIN");
    const u3 = await makeUser("c", "DEALMAKER", "ANGEL");
    const u4 = await makeUser("d", "BUILDER", "SHIELD");
    check("رمز هش شده ذخیره می‌شود", u1.passwordHash.startsWith("$2") && !u1.passwordHash.includes("secret123"));
    check("رمز درست تأیید می‌شود", await verifyPassword("secret123", u1.passwordHash));
    check("رمز غلط رد می‌شود", !(await verifyPassword("wrong", u1.passwordHash)));
    check(
      "avatarSeed از role-power-اعداد-نام ساخته می‌شود",
      u1.avatarSeed === `BUILDER-HYPE-5-50-7-100-${u1.nickname}`,
      u1.avatarSeed
    );
    check("کیف بذر/خرید از تنظیمات پر می‌شود", u1.seedWallet > 0 && u1.buyWallet > 0);

    console.log("\n# ۲ — ساخت تیم و اسلاگ");
    check("slugify نام فارسی ASCII می‌دهد", /^[a-z0-9-]+$/.test(slugify("تیم نمونه")));
    const r1 = await createTeamForUser(u1.id, `تیم ${TAG}`);
    check("createTeamForUser موفق", !!r1.ok, JSON.stringify(r1));
    const u1b = await prisma.user.findUnique({ where: { id: u1.id }, include: { team: true } });
    if (u1b?.teamId) createdTeamIds.add(u1b.teamId);
    check("کاربر در همان تراکنش عضو تیم شد", !!u1b?.teamId);
    check("اسلاگ تیم ASCII و یکتاست", !!u1b?.team && /^[a-z0-9-]+$/.test(u1b.team.slug), u1b?.team?.slug);
    const r1dup = await createTeamForUser(u1.id, "تیم دوم");
    check("ساخت تیم دوم رد می‌شود", !!r1dup.error, JSON.stringify(r1dup));

    console.log("\n# ۳ — دعوت");
    const selfInv = await inviteToTeam(u1.id, u1.email.toUpperCase());
    check("دعوت خود کاربر رد می‌شود", selfInv.error === "نمی‌توانی خودت را دعوت کنی.", JSON.stringify(selfInv));
    const inv1 = await inviteToTeam(u1.id, u2.email);
    check("دعوت هم‌تیمی ثبت شد", !!inv1.ok, JSON.stringify(inv1));
    const inv1dup = await inviteToTeam(u1.id, u2.email);
    check("دعوت تکراری رد می‌شود", !!inv1dup.error, JSON.stringify(inv1dup));

    const invite2 = await prisma.teamInvite.findFirstOrThrow({ where: { email: u2.email, status: "PENDING" } });
    const badAccept = await acceptInvite(u3.id, invite2.id);
    check("پذیرش دعوتِ کسِ دیگر رد می‌شود", !!badAccept.error, JSON.stringify(badAccept));
    const acc = await acceptInvite(u2.id, invite2.id);
    check("پذیرش دعوت موفق", !!acc.ok, JSON.stringify(acc));
    const inv2after = await prisma.teamInvite.findUnique({ where: { id: invite2.id } });
    check("وضعیت دعوت ACCEPTED شد", inv2after?.status === "ACCEPTED");
    const invTaken = await inviteToTeam(u1.id, u2.email);
    check("دعوت کاربرِ دارای تیم رد می‌شود", invTaken.error === "این کاربر قبلاً عضو یک تیم است.", JSON.stringify(invTaken));

    console.log("\n# ۴ — رد دعوت");
    const inv3 = await inviteToTeam(u1.id, u3.email);
    check("دعوت سوم ثبت شد", !!inv3.ok, JSON.stringify(inv3));
    const invite3 = await prisma.teamInvite.findFirstOrThrow({ where: { email: u3.email, status: "PENDING" } });
    const dec = await declineInvite(u3.id, invite3.id);
    check("رد دعوت موفق", !!dec.ok, JSON.stringify(dec));
    const decAgain = await declineInvite(u3.id, invite3.id);
    check("رد دوبارهٔ همان دعوت رد می‌شود", !!decAgain.error);

    console.log("\n# ۵ — هم‌تیم‌سازی خودکار");
    const mm3 = await joinMatchmaking(u3.id);
    check("joinMatchmaking موفق", !!mm3.ok, JSON.stringify(mm3));
    const u3b = await prisma.user.findUnique({ where: { id: u3.id } });
    if (u3b?.teamId) createdTeamIds.add(u3b.teamId);
    check("به تیمِ نیازمند نقش DEALMAKER پیوست", u3b?.teamId === u1b?.teamId, `${u3b?.teamId} vs ${u1b?.teamId}`);

    const members = await prisma.user.count({ where: { teamId: u1b!.teamId } });
    check("تیم سه‌نفره شد", members === 3, String(members));
    const invFull = await inviteToTeam(u1.id, u4.email);
    check("دعوت وقتی تیم پر است رد می‌شود", invFull.error === "تیم پر است؛ ظرفیت هر تیم سه نفر است.", JSON.stringify(invFull));

    const mm4 = await joinMatchmaking(u4.id);
    check("کاربر چهارم موفق", !!mm4.ok, JSON.stringify(mm4));
    const u4b = await prisma.user.findUnique({ where: { id: u4.id }, include: { team: true } });
    if (u4b?.teamId) createdTeamIds.add(u4b.teamId);
    check("چون تیم پر بود، تیم تازه ساخته شد", !!u4b?.teamId && u4b.teamId !== u1b?.teamId);
    check("اسلاگ تیم خودکار ASCII است", !!u4b?.team && /^[a-z0-9-]+$/.test(u4b.team.slug), u4b?.team?.slug);

    console.log("\n# ۶ — ترک تیم");
    const soloTeamId = u4b!.teamId!;
    const lv4 = await leaveTeam(u4.id);
    check("ترک تیم موفق", !!lv4.ok, JSON.stringify(lv4));
    const gone = await prisma.team.findUnique({ where: { id: soloTeamId } });
    check("تیمِ خالی حذف شد", gone === null);
    createdTeamIds.delete(soloTeamId);

    // تیمی که دعوت در انتظار دارد: حذف باید بدون خطای کلید خارجی انجام شود
    const r5 = await createTeamForUser(u4.id, `تیم دعوتی ${TAG}`);
    check("تیم دوم برای کاربر چهارم", !!r5.ok, JSON.stringify(r5));
    const u4c = await prisma.user.findUnique({ where: { id: u4.id } });
    const teamWithInviteId = u4c!.teamId!;
    createdTeamIds.add(teamWithInviteId);
    await inviteToTeam(u4.id, mail("ghost"));
    const lv4b = await leaveTeam(u4.id);
    check("ترک تیمِ دارای دعوت در انتظار موفق", !!lv4b.ok, JSON.stringify(lv4b));
    check(
      "تیم با وجود TeamInvite حذف شد (بدون onDelete در schema)",
      (await prisma.team.findUnique({ where: { id: teamWithInviteId } })) === null
    );
    check(
      "دعوت‌های آن تیم هم پاک شدند",
      (await prisma.teamInvite.count({ where: { teamId: teamWithInviteId } })) === 0
    );
    createdTeamIds.delete(teamWithInviteId);

    console.log("\n# ۷ — قفل فاز");
    // سیاست فاز (src/lib/team.ts): «ترک تیم» فقط در فاز ثبت‌نام،
    // اما «ساخت/دعوت» تا پایان «اتاق ایده» باز می‌ماند.
    await setPhase("IDEATION", original.endsAt);
    const lvLate = await leaveTeam(u3.id);
    check("ترک تیم خارج از فاز ثبت‌نام رد می‌شود", !!lvLate.error, JSON.stringify(lvLate));
    const mkIdeation = await createTeamForUser(u4.id, "تیم اتاق ایده");
    check("ساخت تیم در فاز «اتاق ایده» هنوز مجاز است", !mkIdeation.error, JSON.stringify(mkIdeation));
    const u4d = await prisma.user.findUnique({ where: { id: u4.id }, select: { teamId: true } });
    if (u4d?.teamId) createdTeamIds.add(u4d.teamId);
    const invIdeation = await inviteToTeam(u4.id, mail("ideation"));
    check("دعوت در فاز «اتاق ایده» هنوز مجاز است", !invIdeation.error, JSON.stringify(invIdeation));

    // دعوت‌ها از تیم تازهٔ u4 فرستاده می‌شود؛ تیم u1 پر است و
    // خطای «تیم پر است» قبولی جعلی برای آزمون قفل فاز می‌ساخت.
    // مرز واقعی: از «دور سرمایه‌گذاری» به بعد تشکیل تیم بسته است.
    await setPhase("SEED_ROUND", original.endsAt);
    const u5 = await makeUser("e", "BUILDER", "HYPE");
    const mkLate = await createTeamForUser(u5.id, "تیم دیرهنگام");
    check("ساخت تیم بعد از «اتاق ایده» رد می‌شود", !!mkLate.error, JSON.stringify(mkLate));
    const invLate = await inviteToTeam(u4.id, mail("late"));
    check("دعوت بعد از «اتاق ایده» رد می‌شود", !!invLate.error, JSON.stringify(invLate));
    await setPhase("REGISTRATION", original.endsAt);
  } finally {
    console.log("\n# پاک‌سازی");
    const users = await prisma.user.findMany({ where: { email: { startsWith: TAG } }, select: { id: true, teamId: true } });
    for (const u of users) if (u.teamId) createdTeamIds.add(u.teamId);
    await prisma.teamInvite.deleteMany({ where: { OR: [{ email: { startsWith: TAG } }, { teamId: { in: [...createdTeamIds] } }] } });
    await prisma.user.updateMany({ where: { id: { in: users.map((u) => u.id) } }, data: { teamId: null } });
    await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
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
