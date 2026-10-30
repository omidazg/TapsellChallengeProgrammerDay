import Link from "next/link";
import { requireJudge } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listJuryRows } from "@/lib/jury";
import { juryRawScore } from "@/lib/economy/engine";
import { getModuleStatus, MODULE_STATUS_LABEL } from "@/lib/module-state";
import { productAiTag } from "@/lib/ai-tag";
import { LIVE_STATUS_LABEL, type LiveStatus } from "@/lib/studio";
import { listAllTracks } from "@/lib/track-data";
import { ENTRY_CATEGORY_LABEL, entryCategory } from "@/lib/tracks";
import { AiTag } from "@/components/AiTag";
import { PageHeader, Container, Empty, Alert } from "@/components/ui";
import { fa } from "@/lib/persian";
import { JuryScoreForm } from "./JuryScoreForm";

export const metadata = { title: "داوری · پنل برگزارکننده" };

/** نمرهٔ ۰..۱۰۰ با یک رقم اعشار */
function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function parseScores(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export default async function AdminJuryPage() {
  const user = await requireJudge();
  const [rows, products, tracks, flags, status] = await Promise.all([
    listJuryRows(user.id),
    prisma.product.findMany({
      where: { submittedAt: { not: null } },
      select: {
        id: true,
        tagline: true,
        description: true,
        demoUrl: true,
        teaserUrl: true,
        deliverableUrl: true,
        contentType: true,
        preExistingNote: true,
        category: true,
        liveStatus: true,
        aiQuality: true,
        aiNotes: true,
        aiFinal: true,
        aiFinalNotes: true,
        osIssue: { select: { title: true, url: true } },
        team: { select: { _count: { select: { members: true } } } },
      },
    }),
    listAllTracks(),
    prisma.bazaarStat.findMany({ where: { flagged: true }, select: { productId: true, flagNote: true } }),
    getModuleStatus("jury"),
  ]);
  // میانگین و تعداد داورها فقط برای ادمین کامل است؛ داور باید مستقل نمره بدهد.
  const allScores = user.isAdmin ? await prisma.juryScore.findMany({ select: { productId: true, scores: true } }) : [];

  const detail = new Map(products.map((p) => [p.id, p]));
  const flagOf = new Map(flags.map((f) => [f.productId, f.flagNote]));
  const scoresOf = new Map<string, Record<string, unknown>[]>();
  for (const s of allScores) {
    const list = scoresOf.get(s.productId) ?? [];
    list.push(parseScores(s.scores));
    scoresOf.set(s.productId, list);
  }

  const canScore = status === "open";
  const myDone = rows.filter((r) => r.criteria.every((c) => typeof r.mine[c.key] === "number")).length;
  const trackList = tracks.filter((t) => rows.some((r) => r.trackId === t.id));

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="داوری"
        desc="هر داور مستقل به معیارهای محور از ۰ تا ۱۰ نمره می‌دهد و نمرهٔ نهایی میانگین داورهاست. همهٔ ثبت‌ها داوری می‌شوند."
      />
      <Container className="space-y-6">
        {!canScore && (
          <Alert kind="info">
            بخش داوری فعلاً «{MODULE_STATUS_LABEL[status]}» است و ثبت نمره ممکن نیست.
            {user.isAdmin && (
              <>
                {" "}
                از <Link href="/admin/control" className="underline font-bold">مرکز کنترل</Link> بازش کن.
              </>
            )}
          </Alert>
        )}
        {rows.length > 0 && (
          <p className="text-xs text-brand-slate fa-num">
            {fa(myDone)} از {fa(rows.length)} ثبت را کامل نمره داده‌ای.
          </p>
        )}

        {rows.length === 0 ? (
          <Empty title="هنوز محصولی ثبت نهایی نشده" />
        ) : (
          trackList.map((track) => (
            <section key={track.id} className="space-y-4" aria-labelledby={`jury-track-${track.id}`}>
              <h2 id={`jury-track-${track.id}`} className="text-lg font-black text-brand-navy">{track.name}</h2>
              {rows
                .filter((r) => r.trackId === track.id)
                .map((r) => {
                  const p = detail.get(r.productId);
                  const flagNote = flagOf.get(r.productId);
                  const liveStatus = (p?.liveStatus ?? "") as LiveStatus;
                  const aiTag = p ? productAiTag({ aiQuality: p.aiFinal ?? p.aiQuality, aiNotes: p.aiFinalNotes ?? p.aiNotes }) : null;
                  const aiNotes = p?.aiFinalNotes ?? p?.aiNotes;
                  const category = p ? entryCategory(track.category, p.category) : "";
                  const members = p?.team._count.members ?? 0;
                  const average = user.isAdmin ? juryRawScore(scoresOf.get(r.productId) ?? [], r.criteria.map((c) => c.key)) : null;
                  return (
                    <article key={r.productId} className="card p-4 sm:p-6 space-y-4 anim-rise" aria-labelledby={`product-${r.productId}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 id={`product-${r.productId}`} className="font-black text-brand-navy break-words">
                            {r.productName} <span className="text-xs text-brand-slate font-normal">— {r.teamName}</span>
                          </h3>
                          {p?.tagline && <div className="text-sm text-brand-slate break-words">{p.tagline}</div>}
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold">
                            <a href={`/market/${r.productSlug}`} target="_blank" rel="noreferrer" className="text-brand-cyan-dark hover:underline">
                              صفحهٔ محصول ↗
                            </a>
                            {p?.demoUrl && (
                              <a href={p.demoUrl} target="_blank" rel="noreferrer noopener" className="text-brand-cyan-dark hover:underline">
                                دمو ↗
                              </a>
                            )}
                            {p?.teaserUrl && (
                              <a href={p.teaserUrl} target="_blank" rel="noreferrer noopener" className="text-brand-cyan-dark hover:underline">
                                تیزر ↗
                              </a>
                            )}
                            {p?.deliverableUrl && (
                              <a href={p.deliverableUrl} target="_blank" rel="noreferrer noopener" className="text-brand-cyan-dark hover:underline">
                                لینک تحویل ↗
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {category && <span className="chip-navy">{ENTRY_CATEGORY_LABEL[category]}</span>}
                          {p?.contentType && <span className="chip-navy">{p.contentType}</span>}
                          <span className="chip-navy">{members <= 1 ? "👤 شرکت فردی" : `👥 ${fa(members)} نفره`}</span>
                          {liveStatus && (
                            <span className={liveStatus === "LIVE" ? "chip-ok" : "chip-navy"}>{LIVE_STATUS_LABEL[liveStatus]}</span>
                          )}
                        </div>
                      </div>

                      {p?.osIssue && <p className="text-sm text-brand-navy break-words">ایشو: {p.osIssue.title}</p>}
                      {p?.description && <p className="text-sm text-brand-slate break-words whitespace-pre-line">{p.description}</p>}
                      {p?.preExistingNote && (
                        <p className="text-xs text-brand-slate break-words whitespace-pre-line">کار پیش از مسابقه: {p.preExistingNote}</p>
                      )}
                      {flagNote !== undefined && <Alert kind="error">🚩 آمار بازار مشکوک است: {flagNote || "بدون یادداشت"}</Alert>}

                      <div className="rounded-2xl bg-brand-ice p-3 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-bold text-brand-navy">ارزیابی هوش مصنوعی</span>
                          {aiTag ? (
                            <>
                              <AiTag tag={aiTag} compact />
                              <span className="fa-num text-brand-slate">{fa(aiTag.score)} از ۱۰۰</span>
                            </>
                          ) : (
                            <span className="text-brand-slate">هنوز ارزیابی نشده</span>
                          )}
                        </div>
                        {aiNotes && <p className="text-sm text-brand-slate break-words whitespace-pre-line">{aiNotes}</p>}
                      </div>

                      {user.isAdmin && (
                        <p className="text-sm font-bold text-brand-navy fa-num">
                          میانگین داوران: {average === null ? "هنوز نمره‌ای ثبت نشده" : `${fa(round1(average))} از ۱۰۰`}
                          <span className="text-xs font-normal text-brand-slate"> · {fa(r.judgeCount)} داور</span>
                        </p>
                      )}

                      <JuryScoreForm productId={r.productId} criteria={r.criteria} mine={r.mine} note={r.myNote} disabled={!canScore} />
                    </article>
                  );
                })}
            </section>
          ))
        )}
      </Container>
    </>
  );
}
