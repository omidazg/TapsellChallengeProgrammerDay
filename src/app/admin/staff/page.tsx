import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty, Alert } from "@/components/ui";
import { fa } from "@/lib/persian";
import { StaffRoleForm } from "./StaffRoleForm";

export const metadata = { title: "داوران و اپراتورها · پنل برگزارکننده" };

const PAGE_LIMIT = 100;
const SELECT = {
  id: true,
  nickname: true,
  email: true,
  staffRole: true,
  isAdmin: true,
  team: { select: { name: true } },
} as const;

export default async function AdminStaffPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";

  const [staff, matches, total] = await Promise.all([
    prisma.user.findMany({ where: { staffRole: { not: "" } }, select: SELECT, orderBy: { nickname: "asc" } }),
    prisma.user.findMany({
      where: { staffRole: "", ...(q ? { OR: [{ nickname: { contains: q } }, { email: { contains: q } }] } : {}) },
      select: SELECT,
      orderBy: { createdAt: "asc" },
      take: PAGE_LIMIT,
    }),
    prisma.user.count({ where: { staffRole: "", ...(q ? { OR: [{ nickname: { contains: q } }, { email: { contains: q } }] } : {}) } }),
  ]);

  const row = (u: (typeof staff)[number]) => (
    <li key={u.id} className="card p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-bold text-brand-navy break-words">
          {u.nickname}
          {u.isAdmin && <span className="chip-red ms-2">ادمین کامل</span>}
        </div>
        <div className="text-xs text-brand-slate break-all">{u.email}</div>
        {/* داوری که عضو یک تیم است به تیم خودش هم می‌تواند نمره بدهد؛ بهتر است برگزارکننده ببیند. */}
        {u.team && <div className="text-xs text-brand-slate">عضو تیم «{u.team.name}»</div>}
      </div>
      <StaffRoleForm userId={u.id} nickname={u.nickname} current={u.staffRole} />
    </li>
  );

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="داوران و اپراتورها"
        desc="داور فقط صفحهٔ داوری را می‌بیند و اپراتور بازار استودیو فقط درخواست‌های انتشار و آمار بازار را. ادمین کامل از صفحهٔ «کاربران» تعیین می‌شود."
      />
      <Container className="space-y-6">
        <section className="space-y-3" aria-labelledby="staff-title">
          <h2 id="staff-title" className="text-lg font-black text-brand-navy">نقش‌های فعلی</h2>
          {staff.length === 0 ? <Empty title="هنوز نقشی داده نشده" /> : <ul className="space-y-2">{staff.map(row)}</ul>}
        </section>

        <section className="space-y-3" aria-labelledby="users-title">
          <h2 id="users-title" className="text-lg font-black text-brand-navy">دادن نقش به کاربر</h2>
          <form className="flex flex-wrap items-center gap-2" role="search">
            <label htmlFor="staff-q" className="sr-only">جست‌وجوی کاربر</label>
            <input id="staff-q" name="q" defaultValue={q} placeholder="نام مستعار یا ایمیل" className="input !w-auto flex-1 min-w-48" />
            <button type="submit" className="btn-ghost min-h-10">جست‌وجو</button>
          </form>
          {total > PAGE_LIMIT && <Alert kind="info">فقط {fa(PAGE_LIMIT)} نفر از {fa(total)} نفر نمایش داده شده است؛ جست‌وجو کن.</Alert>}
          {matches.length === 0 ? <Empty title="کاربری پیدا نشد" /> : <ul className="space-y-2">{matches.map(row)}</ul>}
        </section>
      </Container>
    </>
  );
}
