/**
 * دود-تست اعلان‌ها و اطلاعیه‌ها — مسیرهای واقعی src/lib/notifications.ts را اجرا می‌کند.
 * اجرا: npx tsx scripts/smoke-notifications.ts
 * همهٔ ردیف‌های ساخته‌شده در پایان پاک می‌شوند.
 */
import "dotenv/config";
import { createTempDb, isTempDatabaseUrl } from "./lib/temp-db";

// DATABASE_URL باید پیش از import شدن src/lib/db تنظیم شود؛ اگر از قبل به یک
// پایگاه‌دادهٔ موقت اشاره نمی‌کرد، اینجا یکی می‌سازیم تا هرگز به dev.db وصل نشویم.
const ownTempDb = isTempDatabaseUrl(process.env.DATABASE_URL) ? null : createTempDb("notif");

const TAG = "smoke-notif-" + Date.now();
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
  const { hashPassword } = await import("../src/lib/auth");
  const {
    notifyUser,
    notifyTeam,
    notifyAll,
    notifyPhaseChange,
    listNotifications,
    unreadCount,
    markAllRead,
    markRead,
    createAnnouncement,
    getActiveAnnouncements,
    toggleAnnouncement,
    deleteAnnouncement,
  } = await import("../src/lib/notifications");

  async function makeUser(n: string) {
    return prisma.user.create({
      data: {
        email: mail(n),
        passwordHash: await hashPassword("secret123"),
        nickname: `آزمون ${n}`,
        role: "BUILDER",
        power: "HYPE",
      },
    });
  }

  const createdTeamIds = new Set<string>();
  const createdAnnouncementIds = new Set<string>();
  let allTestStart: Date | null = null;
  let allTestEnd: Date | null = null;

  try {
    console.log("\n# ۱ — notifyUser / unreadCount / listNotifications");
    const u1 = await makeUser("a");
    const u2 = await makeUser("b");
    await notifyUser(u1.id, { kind: "TEST", title: "سلام", body: "یک پیام آزمایشی", href: "/x" });
    check("unreadCount پس از یک اعلان = ۱", (await unreadCount(u1.id)) === 1);
    const list1 = await listNotifications(u1.id, 10);
    check("listNotifications یک ردیف برمی‌گرداند", list1.length === 1 && list1[0].title === "سلام", JSON.stringify(list1));
    check("اعلان کاربر دیگر صفر است", (await unreadCount(u2.id)) === 0);

    console.log("\n# ۲ — markAllRead / markRead");
    await notifyUser(u1.id, { kind: "TEST", title: "دوم" });
    check("unreadCount حالا ۲ است", (await unreadCount(u1.id)) === 2);
    await markAllRead(u1.id);
    check("پس از markAllRead صفر است", (await unreadCount(u1.id)) === 0);
    await notifyUser(u1.id, { kind: "TEST", title: "سوم" });
    const third = (await listNotifications(u1.id, 1))[0];
    await markRead(third.id, u1.id);
    check("markRead فقط همان ردیف را خوانده می‌کند", (await unreadCount(u1.id)) === 0);

    console.log("\n# ۳ — notifyTeam");
    const team = await prisma.team.create({ data: { name: `تیم ${TAG}`, slug: `team-${TAG}`.toLowerCase() } });
    createdTeamIds.add(team.id);
    await prisma.user.updateMany({ where: { id: { in: [u1.id, u2.id] } }, data: { teamId: team.id } });
    await notifyTeam(team.id, { kind: "TEAM_TEST", title: "پیام تیمی" });
    check("هر دو عضو تیم اعلان تیمی گرفتند", (await unreadCount(u1.id)) === 1 && (await unreadCount(u2.id)) === 1);

    // notifyAll/notifyPhaseChange به همهٔ کاربران دیتابیس می‌نویسند، نه فقط کاربران آزمون؛
    // برای پاک نماندن اعلان‌های اضافه روی کاربران واقعی، بازهٔ زمانی این دو فراخوانی علامت‌گذاری
    // می‌شود تا در پاک‌سازی، فقط همین ردیف‌ها (برای همهٔ کاربران) حذف شوند.
    console.log("\n# ۴ — notifyAll / notifyPhaseChange");
    const beforeAll1 = await unreadCount(u1.id);
    const beforeAll2 = await unreadCount(u2.id);
    allTestStart = new Date();
    await notifyAll({ kind: "ALL_TEST", title: "پیام عمومی" });
    check("notifyAll به هر دو کاربر رسید", (await unreadCount(u1.id)) === beforeAll1 + 1 && (await unreadCount(u2.id)) === beforeAll2 + 1);

    const beforePhase1 = await unreadCount(u1.id);
    await notifyPhaseChange("BUILD");
    allTestEnd = new Date();
    const afterPhase = await listNotifications(u1.id, 1);
    check("notifyPhaseChange عنوان فاز را می‌فرستد", (await unreadCount(u1.id)) === beforePhase1 + 1 && afterPhase[0].href === "/build", JSON.stringify(afterPhase[0]));

    console.log("\n# ۵ — اطلاعیه‌ها (Announcement)");
    await createAnnouncement(`اطلاعیهٔ ${TAG}`, "warning");
    const active = await getActiveAnnouncements();
    const mine = active.find((a) => a.text === `اطلاعیهٔ ${TAG}`);
    check("اطلاعیهٔ جدید فعال است", !!mine && mine.level === "warning", JSON.stringify(mine));
    if (mine) {
      createdAnnouncementIds.add(mine.id);
      await toggleAnnouncement(mine.id, false);
      const activeAfter = await getActiveAnnouncements();
      check("پس از غیرفعال‌کردن در لیست فعال نیست", !activeAfter.some((a) => a.id === mine.id));
      await deleteAnnouncement(mine.id);
      createdAnnouncementIds.delete(mine.id);
      const gone = await prisma.announcement.findUnique({ where: { id: mine.id } });
      check("حذف اطلاعیه موفق", gone === null);
    }
  } finally {
    console.log("\n# پاک‌سازی");
    const users = await prisma.user.findMany({ where: { email: { startsWith: TAG } }, select: { id: true } });
    const userIds = users.map((u) => u.id);
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    // notifyAll/notifyPhaseChange به همهٔ کاربران دیتابیس نوشتند؛ آن ردیف‌ها را هم (برای همهٔ کاربران) پاک کن.
    if (allTestStart && allTestEnd) {
      await prisma.notification.deleteMany({
        where: { kind: "ALL_TEST", title: "پیام عمومی", createdAt: { gte: allTestStart, lte: allTestEnd } },
      });
      await prisma.notification.deleteMany({
        where: { kind: "PHASE_CHANGE", href: "/build", createdAt: { gte: allTestStart, lte: allTestEnd } },
      });
    }
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { teamId: null } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.team.deleteMany({ where: { id: { in: [...createdTeamIds] } } });
    await prisma.announcement.deleteMany({ where: { id: { in: [...createdAnnouncementIds] } } });
    const leftUsers = await prisma.user.count({ where: { email: { startsWith: TAG } } });
    const leftNotifs = await prisma.notification.count({ where: { userId: { in: userIds } } });
    console.log(`  کاربر باقی‌مانده: ${leftUsers} — اعلان باقی‌مانده: ${leftNotifs}`);
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
