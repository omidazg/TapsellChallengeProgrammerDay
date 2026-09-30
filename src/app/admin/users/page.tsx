import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty } from "@/components/ui";
import { fa, toEnDigits } from "@/lib/persian";
import { normalizePhone } from "@/lib/phone";
import { UserRow } from "./UserRow";

export const metadata = { title: "کاربران · پنل برگزارکننده" };

const PAGE_SIZE = 50;

const FILTERS = [
  { value: "all", label: "همه" },
  { value: "admin", label: "ادمین" },
  { value: "blocked", label: "مسدود" },
  { value: "teamless", label: "بی‌تیم" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

const FILTER_WHERE: Record<Filter, Prisma.UserWhereInput> = {
  all: {},
  admin: { isAdmin: true },
  blocked: { blockedAt: { not: null } },
  teamless: { teamId: null },
};

type SearchParams = { q?: string | string[]; f?: string | string[]; page?: string | string[] };

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

/** ساخت آدرس همین صفحه با پارامترهای جست‌وجو/فیلتر/صفحه (مقادیر پیش‌فرض حذف می‌شوند). */
function usersHref({ q, f, page }: { q: string; f: Filter; page: number }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (f !== "all") params.set("f", f);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 80);
  const rawF = one(sp.f);
  const f: Filter = FILTERS.some((x) => x.value === rawF) ? (rawF as Filter) : "all";
  const requestedPage = Math.max(1, parseInt(toEnDigits(one(sp.page)), 10) || 1);

  // همان الگوی جست‌وجوی لیست سفید: ایمیل‌ها lowercase ذخیره می‌شوند و موبایل نرمال‌سازی می‌شود.
  const phone = q ? normalizePhone(q) : null;
  const search: Prisma.UserWhereInput = q
    ? {
        OR: [
          { nickname: { contains: q } },
          { email: { contains: q.toLowerCase() } },
          phone ? { phone } : { phone: { contains: toEnDigits(q) } },
        ],
      }
    : {};
  const where: Prisma.UserWhereInput = { AND: [search, FILTER_WHERE[f]] };

  const [total, filterCounts] = await Promise.all([
    prisma.user.count({ where }),
    Promise.all(FILTERS.map((x) => prisma.user.count({ where: { AND: [search, FILTER_WHERE[x.value]] } }))),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  const users = await prisma.user.findMany({
    where,
    include: { team: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = (page - 1) * PAGE_SIZE + users.length;

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="کاربران" desc="دسترسی برگزارکنندگی و تنظیم دستی کیف پول." />
      <Container className="space-y-4">
        <div className="card p-4 space-y-3">
          <form className="flex flex-wrap items-center gap-2" role="search">
            <label htmlFor="users-search" className="sr-only">جست‌وجوی کاربران</label>
            <input
              id="users-search"
              name="q"
              type="search"
              defaultValue={q}
              className="input !py-2 flex-1 min-w-0 sm:max-w-sm"
              placeholder="نام مستعار، ایمیل یا موبایل…"
            />
            {f !== "all" && <input type="hidden" name="f" value={f} />}
            <button type="submit" className="btn-ghost !py-2 !px-4 text-sm min-h-10">جست‌وجو</button>
            {(q || f !== "all") && (
              <Link href="/admin/users" className="inline-flex items-center min-h-10 px-2 text-xs font-bold text-brand-cyan-dark">
                پاک کردن
              </Link>
            )}
          </form>
          <nav aria-label="فیلتر کاربران" className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {FILTERS.map((x, i) => {
              const active = x.value === f;
              return (
                <Link
                  key={x.value}
                  href={usersHref({ q, f: x.value, page: 1 })}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-pill px-4 min-h-10 text-sm font-bold whitespace-nowrap transition ${
                    active ? "bg-brand-navy text-white" : "bg-brand-ice text-brand-navy hover:bg-brand-mist"
                  }`}
                >
                  {x.label}
                  <span className={`fa-num text-xs ${active ? "opacity-80" : "text-brand-slate"}`}>{fa(filterCounts[i])}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <p className="text-xs text-brand-slate" aria-live="polite">
          {total === 0 ? "کاربری پیدا نشد." : `نمایش ${fa(from)} تا ${fa(to)} از ${fa(total)} کاربر`}
        </p>

        {users.length === 0 ? (
          <Empty title={q || f !== "all" ? "موردی پیدا نشد" : "کاربری ثبت نشده"} />
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <UserRow
                key={u.id}
                isMe={u.id === me.id}
                user={{
                  id: u.id,
                  email: u.email,
                  phone: u.phone,
                  nickname: u.nickname,
                  avatarSeed: u.avatarSeed,
                  isAdmin: u.isAdmin,
                  blocked: !!u.blockedAt,
                  teamName: u.team?.name ?? null,
                  seedWallet: u.seedWallet,
                  buyWallet: u.buyWallet,
                }}
              />
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <nav aria-label="صفحه‌بندی کاربران" className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {page > 1 ? (
              <Link href={usersHref({ q, f, page: page - 1 })} className="btn-ghost !py-2 !px-4 text-sm min-h-10" rel="prev">
                → قبلی
              </Link>
            ) : (
              <span className="btn-ghost !py-2 !px-4 text-sm min-h-10 opacity-40" aria-hidden>→ قبلی</span>
            )}
            <span className="text-sm font-bold text-brand-navy fa-num px-2">
              صفحهٔ {fa(page)} از {fa(pageCount)}
            </span>
            {page < pageCount ? (
              <Link href={usersHref({ q, f, page: page + 1 })} className="btn-ghost !py-2 !px-4 text-sm min-h-10" rel="next">
                بعدی ←
              </Link>
            ) : (
              <span className="btn-ghost !py-2 !px-4 text-sm min-h-10 opacity-40" aria-hidden>بعدی ←</span>
            )}
          </nav>
        )}
      </Container>
    </>
  );
}
