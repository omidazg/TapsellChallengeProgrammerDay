import { prisma } from "./db";
import { ROLES, type RoleKey } from "./constants";

/** تیم به‌همراه اعضا، ایده، محصول و دعوت‌های در انتظار */
export async function getTeamWithMembers(teamId: string) {
  return prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { orderBy: { createdAt: "asc" } },
      idea: true,
      product: true,
      invites: { where: { status: "PENDING" }, include: { inviter: true }, orderBy: { createdAt: "desc" } },
    },
  });
}

export type TeamWithMembers = NonNullable<Awaited<ReturnType<typeof getTeamWithMembers>>>;

/** پوشش سه نقش در بین اعضای تیم */
export function roleCoverage(members: { role: string }[]) {
  const present = new Set(members.map((m) => m.role));
  return (Object.keys(ROLES) as RoleKey[]).map((role) => ({
    role,
    label: ROLES[role].label,
    emoji: ROLES[role].emoji,
    present: present.has(role),
  }));
}

function randomId(len = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** اسلاگ URL-safe از نام تیم؛ نام‌های فارسی به شناسهٔ تصادفی می‌رسند */
export function slugify(name: string) {
  const ascii = name
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii || `team-${randomId(8)}`;
}

/** اسلاگ یکتا در دیتابیس (با پسوند شمارشی در صورت تکرار) */
export async function uniqueSlug(name: string) {
  const base = slugify(name);
  let slug = base;
  let i = 1;
  while (await prisma.team.findUnique({ where: { slug } })) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}

/** نام یکتای پیش‌فرض «تیم شمارهٔ N» برای هم‌تیم‌سازی خودکار */
export async function nextAutoTeamName() {
  const count = await prisma.team.count();
  let n = count + 1;
  while (await prisma.team.findUnique({ where: { name: `تیم شمارهٔ ${n}` } })) {
    n++;
  }
  return `تیم شمارهٔ ${n}`;
}
