import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { actionLabel, actionDomain } from "./labels";
import { relativeFa, summarizeDetail, prettyDetail } from "./format";

export const metadata = { title: "گزارش کارهای ادمین · پنل برگزارکننده" };

const PAGE_SIZE = 50;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; domain?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Math.trunc(Number(sp.page)) || 1);
  const domain = (sp.domain ?? "").trim();

  const [allActions, total] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.count(domain ? { where: { action: { startsWith: `${domain}.` } } } : undefined),
  ]);
  const domains = Array.from(new Set(allActions.map((a) => actionDomain(a.action)))).sort();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const logs = await prisma.auditLog.findMany({
    where: domain ? { action: { startsWith: `${domain}.` } } : undefined,
    include: { actor: { select: { nickname: true, email: true } } },
    orderBy: { createdAt: "desc" },
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  };

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="گزارش کارهای ادمین"
        desc={`تاریخچهٔ کارهای انجام‌شده در پنل مدیریت، تازه‌ترین در بالا (${fa(total)} مورد).`}
      />
      <Container className="space-y-6">
        <form method="get" className="card p-4 sm:p-6 flex flex-wrap items-end gap-3 anim-rise">
          <div>
            <label className="label" htmlFor="domain">فیلتر بر اساس حوزهٔ کنش</label>
            <select id="domain" name="domain" defaultValue={domain} className="input">
              <option value="">همهٔ حوزه‌ها</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary">اعمال فیلتر</button>
          {domain && (
            <Link href="/admin/audit" className="btn-ghost">
              پاک کردن فیلتر
            </Link>
          )}
        </form>

        {logs.length === 0 ? (
          <Empty title="گزارشی ثبت نشده" desc="هنوز کاری در پنل ادمین ثبت‌شده‌ای وجود ندارد." />
        ) : (
          <>
            {/* نمایش کارتی برای موبایل؛ جدول کامل فقط در md+ */}
            <div className="md:hidden space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="card p-4 space-y-2 anim-rise">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-brand-navy">{actionLabel(log.action)}</span>
                    <span className="text-xs text-brand-slate" title={jdatetime(log.createdAt)}>
                      {relativeFa(log.createdAt)}
                    </span>
                  </div>
                  <div className="text-xs text-brand-slate">
                    {log.actor ? `${log.actor.nickname} · ${log.actor.email}` : "کاربر حذف‌شده"}
                  </div>
                  {log.target && <div className="text-xs text-brand-slate break-words">هدف: {log.target}</div>}
                  <div className="text-xs text-brand-slate break-words">{summarizeDetail(log.detail)}</div>
                  {log.detail && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-brand-cyan-dark">جزئیات کامل</summary>
                      <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-brand-ice p-2 fa-num" dir="ltr">
                        {prettyDetail(log.detail)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>

            <div className="hidden md:block card overflow-x-auto anim-rise">
              <table className="w-full text-sm min-w-[820px]">
                <caption className="sr-only">تاریخچهٔ کارهای انجام‌شده توسط برگزارکنندگان، تازه‌ترین در بالا</caption>
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th scope="col" className="px-4 py-3 font-bold">زمان</th>
                    <th scope="col" className="px-4 py-3 font-bold">عامل</th>
                    <th scope="col" className="px-4 py-3 font-bold">کنش</th>
                    <th scope="col" className="px-4 py-3 font-bold">هدف</th>
                    <th scope="col" className="px-4 py-3 font-bold">جزئیات</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-brand-mist last:border-0 align-top">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span title={jdatetime(log.createdAt)}>{relativeFa(log.createdAt)}</span>
                        <div className="text-xs text-brand-slate">{jdatetime(log.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        {log.actor ? (
                          <>
                            <div className="font-bold text-brand-navy">{log.actor.nickname}</div>
                            <div className="text-xs text-brand-slate">{log.actor.email}</div>
                          </>
                        ) : (
                          <span className="text-brand-slate">کاربر حذف‌شده</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-brand-navy">{actionLabel(log.action)}</div>
                        <div className="text-xs text-brand-slate fa-num" dir="ltr">{log.action}</div>
                      </td>
                      <td className="px-4 py-3 break-words max-w-[16rem]">{log.target || "—"}</td>
                      <td className="px-4 py-3 max-w-sm">
                        <div className="text-xs text-brand-slate break-words">{summarizeDetail(log.detail)}</div>
                        {log.detail && (
                          <details className="text-xs mt-1">
                            <summary className="cursor-pointer text-brand-cyan-dark">JSON کامل</summary>
                            <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-brand-ice p-2 fa-num" dir="ltr">
                              {prettyDetail(log.detail)}
                            </pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <nav className="flex flex-wrap items-center justify-center gap-2" aria-label="صفحه‌بندی گزارش کارها">
                <Link
                  href={pageHref(Math.max(1, safePage - 1))}
                  aria-disabled={safePage <= 1}
                  className={`btn-ghost ${safePage <= 1 ? "pointer-events-none opacity-40" : ""}`}
                >
                  قبلی
                </Link>
                <span className="text-sm text-brand-slate fa-num">
                  صفحهٔ {fa(safePage)} از {fa(totalPages)}
                </span>
                <Link
                  href={pageHref(Math.min(totalPages, safePage + 1))}
                  aria-disabled={safePage >= totalPages}
                  className={`btn-ghost ${safePage >= totalPages ? "pointer-events-none opacity-40" : ""}`}
                >
                  بعدی
                </Link>
              </nav>
            )}
          </>
        )}
      </Container>
    </>
  );
}
