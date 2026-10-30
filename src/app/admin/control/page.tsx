import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase, PHASE_LABEL } from "@/lib/phase";
import { getBazaarSource } from "@/lib/bazaar";
import { MODULE_KEYS, MODULE_LABEL, getModuleStatuses, listModuleExceptions } from "@/lib/module-state";
import { listAllTracks } from "@/lib/track-data";
import { PageHeader, Container, Alert, Empty } from "@/components/ui";
import { jdatetime } from "@/lib/persian";
import {
  AddExceptionForm,
  BazaarSourceForm,
  DeadlineForm,
  EndContestButton,
  RemoveExceptionButton,
  StatusRow,
  type ExceptionTarget,
} from "./ControlForms";

export const metadata = { title: "مرکز کنترل · پنل برگزارکننده" };

export default async function AdminControlPage() {
  await requireAdmin();
  const [{ phase, endsAt }, statuses, tracks, bazaarSource, exceptions, teams] = await Promise.all([
    getPhase(),
    getModuleStatuses(),
    listAllTracks(),
    getBazaarSource(),
    listModuleExceptions(),
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const closed = phase === "CLOSED";

  const targets: ExceptionTarget[] = [
    ...MODULE_KEYS.map((key) => ({ value: key, label: `بخش: ${MODULE_LABEL[key]}` })),
    ...tracks.map((t) => ({ value: `track:${t.id}`, label: `محور: ${t.name}` })),
  ];
  const targetLabel = new Map(targets.map((t) => [t.value, t.label]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="مرکز کنترل"
        desc="هر بخش و هر محور وضعیت خودش را دارد و همه‌چیز دستی است. هر تغییر در گزارش کارهای ادمین ثبت می‌شود."
      />
      <Container className="space-y-6">
        {closed && (
          <Alert kind="info">
            مسابقه تمام شده است؛ بخش‌های بازی اگر باز باشند فقط‌خواندنی نمایش داده می‌شوند. داوری، ارزیابی و نتایج همچنان از اینجا کنترل می‌شوند.
          </Alert>
        )}

        <section className="card p-4 sm:p-6 space-y-3 anim-rise" aria-labelledby="modules-title">
          <h2 id="modules-title" className="text-lg font-black text-brand-navy">وضعیت بخش‌ها</h2>
          <p className="text-xs text-brand-slate">
            باز: کار عادی · فقط‌خواندنی: صفحه دیده می‌شود ولی فرم‌ها غیرفعال‌اند · بسته: صفحه پیام بسته‌بودن نشان می‌دهد · مخفی: پیوند و صفحه حذف می‌شوند.
          </p>
          <ul className="space-y-2">
            {MODULE_KEYS.map((key) => (
              <StatusRow key={key} kind="module" id={key} label={MODULE_LABEL[key]} current={statuses[key]} />
            ))}
          </ul>
        </section>

        <section className="card p-4 sm:p-6 space-y-3 anim-rise" aria-labelledby="tracks-title">
          <h2 id="tracks-title" className="text-lg font-black text-brand-navy">وضعیت محورها</h2>
          <p className="text-xs text-brand-slate">محور مخفی در امتیاز حساب نمی‌شود. وزن‌ها و معیارها در صفحهٔ «محورها و وزن‌ها» هستند.</p>
          <ul className="space-y-2">
            {tracks.map((t) => (
              <StatusRow key={t.id} kind="track" id={t.id} label={t.name} current={t.status} />
            ))}
          </ul>
        </section>

        <section className="card p-4 sm:p-6 space-y-4 anim-rise" aria-labelledby="exceptions-title">
          <div>
            <h2 id="exceptions-title" className="text-lg font-black text-brand-navy">استثنا برای یک تیم</h2>
            <p className="text-xs text-brand-slate mt-1">بخش یا محوری که برای همه بسته است فقط برای همین تیم باز می‌شود.</p>
          </div>
          {teams.length === 0 ? (
            <p className="text-sm text-brand-slate">هنوز تیمی ساخته نشده است.</p>
          ) : (
            <AddExceptionForm targets={targets} teams={teams} />
          )}
          {exceptions.length === 0 ? (
            <Empty title="استثنایی ثبت نشده" />
          ) : (
            <ul className="space-y-2">
              {exceptions.map((x) => {
                const label = `${targetLabel.get(x.moduleKey) ?? x.moduleKey} برای ${teamName.get(x.teamId) ?? "تیم حذف‌شده"}`;
                return (
                  <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-brand-ice px-3 py-2">
                    <div className="flex-1 min-w-48 text-sm">
                      <span className="font-bold text-brand-navy break-words">{label}</span>
                      <div className="text-xs text-brand-slate">{jdatetime(x.createdAt)}</div>
                    </div>
                    <RemoveExceptionButton id={x.id} label={label} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-4 sm:p-6 anim-rise" aria-labelledby="bazaar-source-title">
          <h2 id="bazaar-source-title" className="sr-only">منبع آمار بازار</h2>
          <BazaarSourceForm current={bazaarSource} />
        </section>

        <section className="card p-4 sm:p-6 space-y-5 anim-rise" aria-labelledby="deadline-title">
          <div>
            <h2 id="deadline-title" className="text-lg font-black text-brand-navy">پایان مسابقه</h2>
            <p className="text-xs text-brand-slate mt-1">وضعیت فعلی: {PHASE_LABEL[phase]}</p>
          </div>
          <DeadlineForm endsAt={endsAt ? endsAt.toISOString() : null} closed={closed} />
          <EndContestButton closed={closed} />
        </section>
      </Container>
    </>
  );
}
