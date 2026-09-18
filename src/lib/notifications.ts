/**
 * اعلان‌های درون‌برنامه‌ای. قرارداد این توابع ثابت است؛ سایر ماژول‌ها به همین نام‌ها تکیه می‌کنند.
 */
import { prisma } from "./db";
import { PHASE_LABEL, PHASE_DESC, type Phase } from "./phases";
import { sendPushToUsers } from "./push";

export type NotifyInput = { kind: string; title: string; body?: string; href?: string };

/**
 * ارسال اعلان فوری بدون مسدودکردن مسیر اصلی (fire-and-forget). هرگز نباید
 * خطا پرتاب کند یا منتظرش بمانیم؛ sendPushToUsers خودش هم هیچ‌وقت throw نمی‌کند،
 * اما catch اضافه برای اطمینان کامل است.
 */
function firePush(userIds: string[], n: NotifyInput): void {
  sendPushToUsers(userIds, { title: n.title, body: n.body, href: n.href, tag: n.kind }).catch(() => {
    /* sendPushToUsers خودش خطاها را می‌بلعد؛ این فقط شبکهٔ ایمنی است */
  });
}

export async function notifyUser(userId: string, n: NotifyInput): Promise<void> {
  await prisma.notification.create({
    data: { userId, kind: n.kind, title: n.title, body: n.body ?? "", href: n.href ?? "" },
  });
  firePush([userId], n);
}

export async function notifyTeam(teamId: string, n: NotifyInput): Promise<void> {
  const members = await prisma.user.findMany({ where: { teamId }, select: { id: true } });
  if (members.length === 0) return;
  await prisma.notification.createMany({
    data: members.map((m) => ({ userId: m.id, kind: n.kind, title: n.title, body: n.body ?? "", href: n.href ?? "" })),
  });
  firePush(members.map((m) => m.id), n);
}

export async function notifyAll(n: NotifyInput): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true } });
  if (users.length === 0) return;
  await prisma.notification.createMany({
    data: users.map((u) => ({ userId: u.id, kind: n.kind, title: n.title, body: n.body ?? "", href: n.href ?? "" })),
  });
  firePush(users.map((u) => u.id), n);
}

const PHASE_HREF: Record<Phase, string> = {
  REGISTRATION: "/team",
  IDEATION: "/idea",
  SEED_ROUND: "/invest",
  BUILD: "/build",
  MARKET: "/market",
  AUCTION: "/auction",
  CLOSED: "/results",
};

export async function notifyPhaseChange(phase: Phase): Promise<void> {
  await notifyAll({
    kind: "PHASE_CHANGE",
    title: `فاز جدید: ${PHASE_LABEL[phase]}`,
    body: PHASE_DESC[phase],
    href: PHASE_HREF[phase],
  });
}

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

function serialize(n: { id: string; kind: string; title: string; body: string; href: string; readAt: Date | null; createdAt: Date }): NotificationItem {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    href: n.href,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function listNotifications(userId: string, limit = 20): Promise<NotificationItem[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(serialize);
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markRead(id: string, userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
}

// ---------- اطلاعیه‌ها (Announcement) ----------

export type AnnouncementItem = {
  id: string;
  text: string;
  level: string;
  active: boolean;
  createdAt: string;
};

function serializeAnnouncement(a: { id: string; text: string; level: string; active: boolean; createdAt: Date }): AnnouncementItem {
  return { id: a.id, text: a.text, level: a.level, active: a.active, createdAt: a.createdAt.toISOString() };
}

export async function getActiveAnnouncements(): Promise<AnnouncementItem[]> {
  const rows = await prisma.announcement.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } });
  return rows.map(serializeAnnouncement);
}

export async function listAnnouncements(): Promise<AnnouncementItem[]> {
  const rows = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(serializeAnnouncement);
}

export async function createAnnouncement(text: string, level: string): Promise<void> {
  await prisma.announcement.create({ data: { text, level } });
}

export async function toggleAnnouncement(id: string, active: boolean): Promise<void> {
  await prisma.announcement.update({ where: { id }, data: { active } });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await prisma.announcement.delete({ where: { id } });
}
