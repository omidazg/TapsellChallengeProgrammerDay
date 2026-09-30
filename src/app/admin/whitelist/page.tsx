import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { isWhitelistEnabled, ACCESS_STATUS_LABEL } from "@/lib/whitelist";
import { WhitelistToggle, AddEntryForm, BulkAddForm, EntryRow, RequestRow, UnitOptions } from "./WhitelistForms";

export const metadata = { title: "لیست سفید · پنل برگزارکننده" };

export default async function AdminWhitelistPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q: rawQ } = await searchParams;
  const q = (typeof rawQ === "string" ? rawQ : "").trim().slice(0, 80);

  const search = q
    ? {
        OR: [
          { email: { contains: q.toLowerCase() } },
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { position: { contains: q } },
          { unit: { contains: q } },
        ],
      }
    : {};

  const [enabled, entries, totalEntries, pending, reviewed] = await Promise.all([
    isWhitelistEnabled(),
    prisma.allowedEmail.findMany({ where: search, orderBy: { createdAt: "desc" } }),
    prisma.allowedEmail.count(),
    prisma.accessRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.accessRequest.findMany({ where: { status: { not: "PENDING" } }, orderBy: { reviewedAt: "desc" }, take: 20 }),
  ]);

  const registered = await prisma.user.findMany({
    where: { email: { in: entries.map((e) => e.email) } },
    select: { email: true },
  });
  const registeredSet = new Set(registered.map((u) => u.email));

  const toRequest = (r: (typeof pending)[number]) => ({
    id: r.id,
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    position: r.position,
    unit: r.unit,
    status: r.status,
    statusLabel: ACCESS_STATUS_LABEL[r.status] ?? r.status,
    createdAt: `درخواست: ${jdatetime(r.createdAt)}${r.reviewedAt ? ` · بررسی: ${jdatetime(r.reviewedAt)}` : ""}`,
  });

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="لیست سفید و درخواست‌های دسترسی"
        desc="چه کسانی اجازهٔ ثبت‌نام دارند؛ درخواست‌های تازه را تأیید یا رد کن."
      />
      <Container className="space-y-8">
        <UnitOptions />
        <WhitelistToggle enabled={enabled} />

        <section className="space-y-3" aria-labelledby="pending-heading">
          <h2 id="pending-heading" className="text-lg font-black text-brand-navy">
            درخواست‌های در انتظار ({fa(pending.length)})
          </h2>
          {pending.length === 0 ? (
            <Empty title="درخواست تازه‌ای نیست" />
          ) : (
            pending.map((r) => <RequestRow key={r.id} request={toRequest(r)} />)
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <AddEntryForm />
          <BulkAddForm />
        </div>

        <section className="space-y-3" aria-labelledby="entries-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="entries-heading" className="text-lg font-black text-brand-navy">
              لیست سفید ({q ? `${fa(entries.length)} از ${fa(totalEntries)}` : fa(totalEntries)})
            </h2>
            <form className="flex items-center gap-2" role="search">
              <label htmlFor="wl-search" className="sr-only">جست‌وجو در لیست سفید</label>
              <input id="wl-search" name="q" defaultValue={q} className="input !py-1.5 w-56" placeholder="ایمیل، نام، سمت یا واحد…" />
              <button type="submit" className="btn-ghost !py-1.5 !px-3 text-sm">جست‌وجو</button>
              {q && (
                <Link href="/admin/whitelist" className="text-xs font-bold text-brand-cyan-dark">پاک کردن</Link>
              )}
            </form>
          </div>
          {entries.length === 0 ? (
            <Empty title={q ? "موردی پیدا نشد" : "لیست سفید خالی است"} />
          ) : (
            entries.map((e) => (
              <EntryRow
                key={e.id}
                entry={{
                  id: e.id,
                  email: e.email,
                  firstName: e.firstName,
                  lastName: e.lastName,
                  position: e.position,
                  unit: e.unit,
                  note: e.note,
                  hasAccount: registeredSet.has(e.email),
                }}
              />
            ))
          )}
        </section>

        {reviewed.length > 0 && (
          <section className="space-y-3" aria-labelledby="reviewed-heading">
            <h2 id="reviewed-heading" className="text-lg font-black text-brand-navy">آخرین درخواست‌های بررسی‌شده</h2>
            <p className="text-xs text-brand-slate">درخواست ردشده را می‌شود بعداً تأیید کرد.</p>
            {reviewed.map((r) => (
              <RequestRow key={r.id} request={toRequest(r)} />
            ))}
          </section>
        )}
      </Container>
    </>
  );
}
