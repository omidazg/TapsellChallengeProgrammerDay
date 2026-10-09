import { requireAdmin } from "@/lib/auth";
import { listStudioRequests, LIVE_STATUS_LABEL } from "@/lib/studio";
import { PageHeader, Container, Empty, Alert } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { StudioStatusForm } from "./StudioStatusForm";

export const metadata = { title: "بازار استودیو · پنل برگزارکننده" };

const STATUS_CHIP: Record<string, string> = {
  REQUESTED: "chip-gold",
  PUBLISHING: "chip-cyan",
  LIVE: "chip-ok",
  REJECTED: "chip-red",
};

export default async function AdminStudioPage() {
  await requireAdmin();
  const rows = await listStudioRequests();
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="بازار استودیو"
        desc="درخواست‌های انتشار محصول تیم‌ها روی بازار استودیو را پیگیری کن. محصول لایو نشان «🚀 لایو» می‌گیرد و نامزد جایزهٔ «بهترین محصول لایو» است."
      />
      <Container className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="chip-gold">{LIVE_STATUS_LABEL.REQUESTED}: {fa(count("REQUESTED"))}</span>
          <span className="chip-cyan">{LIVE_STATUS_LABEL.PUBLISHING}: {fa(count("PUBLISHING"))}</span>
          <span className="chip-red">{LIVE_STATUS_LABEL.REJECTED}: {fa(count("REJECTED"))}</span>
          <span className="chip-ok">{LIVE_STATUS_LABEL.LIVE}: {fa(count("LIVE"))}</span>
        </div>
        <Alert kind="info">
          انتشار اختیاری است و مستقیم در امتیاز اثری ندارد. با هر تغییر وضعیت (جز «درخواست ثبت شده») تیم اعلان می‌گیرد؛
          یادداشت تو هم برایشان نمایش داده می‌شود.
        </Alert>

        {rows.length === 0 ? (
          <Empty title="هنوز درخواست انتشاری ثبت نشده" desc="تیم‌ها از صفحهٔ ساخت محصول درخواست می‌دهند." />
        ) : (
          rows.map((r) => (
            <article key={r.productId} className="card p-4 sm:p-6 space-y-4 anim-rise" aria-labelledby={`studio-${r.productId}-title`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={`studio-${r.productId}-title`} className="font-black text-brand-navy break-words">
                    {r.productName} <span className="text-xs font-normal text-brand-slate">— {r.teamName}</span>
                  </h2>
                  <div className="text-xs text-brand-slate">
                    {r.requestedAt && <>درخواست: {jdatetime(r.requestedAt)}</>}
                    {r.liveAt && r.status === "LIVE" && <> · لایو: {jdatetime(r.liveAt)}</>}
                  </div>
                </div>
                {r.status && <span className={STATUS_CHIP[r.status] ?? "chip-navy"}>{LIVE_STATUS_LABEL[r.status]}</span>}
              </div>

              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs font-bold text-brand-slate">لینک کد / بستهٔ محصول</dt>
                  <dd className="break-all" dir="ltr">
                    {r.sourceUrl ? (
                      <a href={r.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-brand-cyan-dark hover:underline">
                        {r.sourceUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-bold text-brand-slate">لینک منتشرشده</dt>
                  <dd className="break-all" dir="ltr">
                    {r.liveUrl ? (
                      <a href={r.liveUrl} target="_blank" rel="noreferrer noopener" className="text-brand-cyan-dark hover:underline">
                        {r.liveUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                {r.requestNote && (
                  <div className="sm:col-span-2 min-w-0">
                    <dt className="text-xs font-bold text-brand-slate">توضیح تیم</dt>
                    <dd className="whitespace-pre-line break-words text-brand-navy">{r.requestNote}</dd>
                  </div>
                )}
                {r.adminNote && (
                  <div className="sm:col-span-2 min-w-0">
                    <dt className="text-xs font-bold text-brand-slate">آخرین یادداشت برگزارکننده</dt>
                    <dd className="whitespace-pre-line break-words text-brand-navy">{r.adminNote}</dd>
                  </div>
                )}
              </dl>

              <StudioStatusForm
                productId={r.productId}
                productName={r.productName}
                current={r.status}
                liveUrl={r.liveUrl}
                adminNote={r.adminNote}
              />
            </article>
          ))
        )}
      </Container>
    </>
  );
}
