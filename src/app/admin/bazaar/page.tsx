import { requireStudioOp } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBazaarSource, listBazaarRows } from "@/lib/bazaar";
import { BAZAAR_SOURCE_LABEL } from "@/lib/modules";
import { LIVE_STATUS_LABEL, type LiveStatus } from "@/lib/studio";
import { listAllTracks } from "@/lib/track-data";
import { PageHeader, Container, Alert, Empty, Stat } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { BazaarFlagForm, BazaarImportForm, BazaarSnapshotButton, BazaarStatForm } from "./BazaarForms";

export const metadata = { title: "آمار بازار · پنل برگزارکننده" };

const SOURCE_LABEL: Record<string, string> = { manual: "ورود دستی", excel: "اکسل", api: "API" };

export default async function AdminBazaarPage() {
  await requireStudioOp();
  const [rows, source, tracks, snapshotted] = await Promise.all([
    listBazaarRows(),
    getBazaarSource(),
    listAllTracks(),
    prisma.bazaarStat.count({ where: { snapshotAt: { not: null } } }),
  ]);
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  const flaggedCount = rows.filter((r) => r.flagged).length;

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="آمار بازار"
        desc="نصب فعال، درآمد واقعی، امتیاز ستاره‌ای و تعداد نظر هر محصول. آمار از لحظهٔ انتشار تا ددلاین نهایی سنجیده می‌شود."
      />
      <Container className="space-y-6">
        <div className="grid sm:grid-cols-3 gap-4 stagger">
          <Stat label="منبع آمار" value={BAZAAR_SOURCE_LABEL[source]} tone="navy" />
          <Stat label="محصول‌ها" value={fa(rows.length)} hint={`${fa(snapshotted)} برداشت‌شده`} tone="cyan" />
          <Stat label="پرچم مشکوک" value={fa(flaggedCount)} tone="red" />
        </div>

        {source === "off" && <Alert kind="info">منبع آمار غیرفعال است؛ ادمین می‌تواند آن را از مرکز کنترل عوض کند.</Alert>}
        {source === "api" && <Alert kind="info">منبع آمار API است؛ ورود دستی با همگام‌سازی بعدی بازنویسی می‌شود.</Alert>}

        <section className="card p-4 sm:p-6 space-y-4 anim-rise" aria-labelledby="bazaar-import-title">
          <h2 id="bazaar-import-title" className="text-lg font-black text-brand-navy">ورود گروهی و برداشت نهایی</h2>
          <BazaarImportForm />
          <BazaarSnapshotButton />
        </section>

        <section className="space-y-3" aria-labelledby="bazaar-rows-title">
          <h2 id="bazaar-rows-title" className="text-lg font-black text-brand-navy">محصول‌ها</h2>
          {rows.length === 0 ? (
            <Empty title="هنوز محصولی برای آمار نیست" desc="محصول‌ها با درخواست انتشار اینجا می‌آیند." />
          ) : (
            rows.map((r) => {
              const status = r.liveStatus as LiveStatus;
              return (
                <article key={r.productId} className="card p-4 sm:p-6 space-y-4 anim-rise" aria-labelledby={`bazaar-${r.productId}-title`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 id={`bazaar-${r.productId}-title`} className="font-black text-brand-navy break-words">
                        {r.productName} <span className="text-xs font-normal text-brand-slate">— {r.teamName}</span>
                      </h3>
                      <div className="text-xs text-brand-slate">
                        {trackName.get(r.trackId) ?? r.trackId}
                        {r.bazaarPackage && (
                          <>
                            {" · "}
                            <span dir="ltr" className="font-mono">{r.bazaarPackage}</span>
                          </>
                        )}
                        {r.updatedAt && (
                          <>
                            {" · "}به‌روزرسانی: {jdatetime(r.updatedAt)}
                            {r.source && <> ({SOURCE_LABEL[r.source] ?? r.source})</>}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {status && <span className={status === "LIVE" ? "chip-ok" : "chip-navy"}>{LIVE_STATUS_LABEL[status]}</span>}
                      {r.flagged && <span className="chip-red">🚩 مشکوک</span>}
                    </div>
                  </div>
                  <BazaarStatForm row={r} />
                  <BazaarFlagForm row={r} />
                </article>
              );
            })
          )}
        </section>
      </Container>
    </>
  );
}
