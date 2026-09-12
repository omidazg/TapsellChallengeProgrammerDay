import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty, Alert } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { RunCheckButton } from "./RunCheckButton";

export const metadata = { title: "پرچم‌های تخلف · پنل برگزارکننده" };

export default async function AdminFlagsPage() {
  await requireAdmin();
  const [flags, teams] = await Promise.all([
    prisma.collusionFlag.findMany({ include: { team: true }, orderBy: { createdAt: "desc" } }),
    prisma.team.findMany({ select: { id: true, name: true } }),
  ]);
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="پرچم‌های تخلف" desc="تشخیص خرید متقابل مشکوک بین دو تیم (احتمال همدستی)." />
      <Container className="space-y-6">
        <div className="card p-4 sm:p-6 space-y-3 anim-rise">
          <RunCheckButton />
          <Alert kind="info">اگر مجموع خرید متقابل دو تیم از آستانهٔ تعریف‌شده بیشتر باشد، پرچم ثبت می‌شود.</Alert>
        </div>

        {flags.length === 0 ? (
          <Empty title="پرچمی ثبت نشده" />
        ) : (
          <>
            {/* نمایش کارتی برای موبایل؛ جدول کامل فقط در md+ */}
            <div className="md:hidden space-y-3">
              {flags.map((f) => (
                <div key={f.id} className="card p-4 space-y-2 anim-rise">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-brand-navy break-words">{f.team.name}</span>
                    <span className="text-xs text-brand-slate">↔</span>
                    <span className="font-bold text-brand-navy break-words">{teamNames.get(f.otherTeamId) ?? "—"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-brand-slate">
                    <span>خرید اول از دوم: <b className="fa-num text-brand-navy">{fa(f.amountAB)}</b></span>
                    <span>خرید دوم از اول: <b className="fa-num text-brand-navy">{fa(f.amountBA)}</b></span>
                  </div>
                  <div className="text-xs text-brand-slate">{jdatetime(f.createdAt)}</div>
                </div>
              ))}
            </div>

            <div className="hidden md:block card overflow-x-auto anim-rise">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th className="px-4 py-3 font-bold">تیم اول</th>
                    <th className="px-4 py-3 font-bold">تیم دوم</th>
                    <th className="px-4 py-3 font-bold">خرید تیم اول از دوم</th>
                    <th className="px-4 py-3 font-bold">خرید تیم دوم از اول</th>
                    <th className="px-4 py-3 font-bold">زمان</th>
                  </tr>
                </thead>
                <tbody>
                  {flags.map((f) => (
                    <tr key={f.id} className="border-b border-brand-mist last:border-0">
                      <td className="px-4 py-3 font-bold text-brand-navy">{f.team.name}</td>
                      <td className="px-4 py-3 font-bold text-brand-navy">{teamNames.get(f.otherTeamId) ?? "—"}</td>
                      <td className="px-4 py-3 fa-num">{fa(f.amountAB)}</td>
                      <td className="px-4 py-3 fa-num">{fa(f.amountBA)}</td>
                      <td className="px-4 py-3 text-brand-slate">{jdatetime(f.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Container>
    </>
  );
}
