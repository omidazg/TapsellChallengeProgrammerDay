import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeAwards, computeScoresCached, getAwardPicks } from "@/lib/scoring";
import { juryRawScore } from "@/lib/economy/engine";
import { PRIZES } from "@/lib/prizes";
import { productAiTag } from "@/lib/ai-tag";
import { LIVE_STATUS_LABEL, type LiveStatus } from "@/lib/studio";
import { AiTag } from "@/components/AiTag";
import { PageHeader, Container, Empty, Alert } from "@/components/ui";
import { fa } from "@/lib/persian";
import { JuryScoreForm } from "./JuryScoreForm";
import { AwardPickForm, type PickGroup } from "./AwardPickForm";

export const metadata = { title: "داوری و جوایز · پنل برگزارکننده" };

/** نمرهٔ ۰..۱۰۰ با یک رقم اعشار */
function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export default async function AdminJuryPage() {
  await requireAdmin();
  const [products, picks, output] = await Promise.all([
    prisma.product.findMany({
      where: { submittedAt: { not: null } },
      include: { team: { select: { id: true, name: true, slug: true, solo: true, _count: { select: { members: true } } } } },
      orderBy: { submittedAt: "asc" },
    }),
    getAwardPicks(),
    computeScoresCached(),
  ]);

  const teamNames = new Map(products.map((p) => [p.team.id, p.team.name]));
  // پیش‌نمایش جوایز با امتیازهای فعلی: هر پروژه حداکثر یک جایزه؛ جایزهٔ انتخابی به تیمی که جایزهٔ بالاتری برده نمی‌رسد.
  const awards = computeAwards(output, { teamNames, picks });
  const prizeOf = (key: "ai" | "live") => PRIZES.find((p) => p.key === key)!;

  const optionLabel = (p: (typeof products)[number]) =>
    `${p.team.name} — ${p.name} (🤖 ${p.aiQuality !== null ? fa(p.aiQuality) : "—"})`;
  const byAi = [...products].sort((a, b) => (b.aiQuality ?? -1) - (a.aiQuality ?? -1));
  const aiGroups: PickGroup[] = [
    { label: "محصولات ثبت‌شده (به ترتیب نمرهٔ هوش مصنوعی)", options: byAi.map((p) => ({ teamId: p.team.id, label: optionLabel(p) })) },
  ];
  const liveGroups: PickGroup[] = [
    {
      label: "🚀 لایو روی بازار استودیو",
      options: products.filter((p) => p.liveStatus === "LIVE").map((p) => ({ teamId: p.team.id, label: `🚀 ${p.team.name} — ${p.name}` })),
    },
    {
      label: "دیگر محصولات (هنوز لایو نیستند)",
      options: products.filter((p) => p.liveStatus !== "LIVE").map((p) => ({ teamId: p.team.id, label: `${p.team.name} — ${p.name}` })),
    },
  ];

  /** هشدار وقتی تیم انتخاب‌شده طبق امتیازهای فعلی جایزهٔ بالاتری می‌برد و این جایزه به او نمی‌رسد */
  function pickWarning(key: "ai" | "live"): string | null {
    const picked = picks[key];
    if (!picked) return null;
    if (awards.some((a) => a.key === key && a.teamId === picked)) return null;
    const other = awards.find((a) => a.teamId === picked);
    if (other) {
      return `«${teamNames.get(picked) ?? "این تیم"}» با امتیازهای فعلی جایزهٔ «${other.label}» را می‌برد؛ چون هر پروژه فقط یک جایزه می‌گیرد، اگر همین بماند جایزهٔ «${prizeOf(key).label}» اهدا نمی‌شود. تیم دیگری انتخاب کن.`;
    }
    return "تیم انتخاب‌شده دیگر در جدول امتیازها نیست؛ دوباره انتخاب کن.";
  }

  const fullyScored = products.filter((p) => p.juryWorks !== null && p.juryValue !== null && p.juryPitch !== null).length;
  const liveCount = products.filter((p) => p.liveStatus === "LIVE").length;

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="داوری و جوایز"
        desc="نمرهٔ داوری انسانی هر محصول را ثبت کن و برندهٔ جوایز انتخابی داوران را برگزین."
      />
      <Container className="space-y-6">
        <section id="award-picks" className="card p-4 sm:p-6 space-y-5 anim-rise scroll-mt-32" aria-labelledby="award-picks-title">
          <div>
            <h2 id="award-picks-title" className="text-lg font-black text-brand-navy">انتخاب جایزه‌ها</h2>
            <p className="text-xs text-brand-slate mt-1">
              «بنیان‌گذار برتر»، «انتخاب داوران» و «انتخاب مردم» خودکار از امتیازها تعیین می‌شوند؛ این دو جایزه را داوران انتخاب
              می‌کنند. هر پروژه حداکثر یک جایزه می‌برد.
            </p>
          </div>
          {products.length === 0 ? (
            <p className="text-sm text-brand-slate">پس از ثبت اولین محصول می‌توانی برنده‌ها را انتخاب کنی.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {(["ai", "live"] as const).map((key) => {
                const prize = prizeOf(key);
                const warning = pickWarning(key);
                return (
                  <div key={key} className="space-y-2">
                    <AwardPickForm
                      award={key}
                      title={`${prize.emoji} ${prize.label} (${fa(prize.sharePct)}٪ صندوق جایزه)`}
                      hint={
                        key === "live"
                          ? `${prize.criterion}. ${liveCount > 0 ? `${fa(liveCount)} محصول لایو است.` : "هنوز محصولی لایو نشده است."}`
                          : `${prize.criterion}. نمرهٔ داور هوش مصنوعی فقط راهنماست.`
                      }
                      current={picks[key]}
                      groups={key === "ai" ? aiGroups : liveGroups}
                    />
                    {warning && <Alert kind="error">{warning}</Alert>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4" aria-labelledby="jury-products-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="jury-products-title" className="text-lg font-black text-brand-navy">داوری انسانی محصولات</h2>
            {products.length > 0 && (
              <span className="text-xs text-brand-slate">
                {fa(fullyScored)} از {fa(products.length)} محصول کامل داوری شده
              </span>
            )}
          </div>
          <Alert kind="info">
            هر پرسش از ۰ تا ۱۰. نمرهٔ داوری = میانگین × ۱۰؛ تعداد اعضای تیم در امتیاز هیچ اثری ندارد. نمرهٔ داور هوش مصنوعی
            جدا حساب می‌شود و فقط برای اطلاع نمایش داده شده است.
          </Alert>

          {products.length === 0 ? (
            <Empty title="هنوز محصولی ثبت نشده" />
          ) : (
            products.map((p) => {
              const members = p.team._count.members;
              const raw = juryRawScore({ works: p.juryWorks, value: p.juryValue, pitch: p.juryPitch });
              const liveStatus = p.liveStatus as LiveStatus;
              const aiTag = productAiTag(p);
              return (
                <article key={p.id} className="card p-4 sm:p-6 space-y-4 anim-rise" aria-labelledby={`product-${p.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 id={`product-${p.id}`} className="font-black text-brand-navy break-words">
                        {p.name} <span className="text-xs text-brand-slate font-normal">— {p.team.name}</span>
                      </h3>
                      {p.tagline && <div className="text-sm text-brand-slate break-words">{p.tagline}</div>}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold">
                        <a href={`/market/${p.team.slug}`} target="_blank" rel="noreferrer" className="text-brand-cyan-dark hover:underline">
                          صفحهٔ محصول ↗
                        </a>
                        {p.demoUrl && (
                          <a href={p.demoUrl} target="_blank" rel="noreferrer noopener" className="text-brand-cyan-dark hover:underline">
                            دمو ↗
                          </a>
                        )}
                        {p.teaserUrl && (
                          <a href={p.teaserUrl} target="_blank" rel="noreferrer noopener" className="text-brand-cyan-dark hover:underline">
                            تیزر ↗
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="chip-navy">{members <= 1 ? "👤 شرکت فردی" : `👥 ${fa(members)} نفره`}</span>
                      {liveStatus && (
                        <span className={liveStatus === "LIVE" ? "chip-ok" : "chip-navy"}>
                          {liveStatus === "LIVE" ? LIVE_STATUS_LABEL.LIVE : `بازار استودیو: ${LIVE_STATUS_LABEL[liveStatus]}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-brand-ice p-3 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold text-brand-navy">داوری هوش مصنوعی</span>
                      {aiTag ? (
                        <>
                          <AiTag tag={aiTag} compact />
                          <span className="fa-num text-brand-slate">{fa(aiTag.score)} از ۱۰۰</span>
                        </>
                      ) : (
                        <span className="text-brand-slate">هنوز ارزیابی نشده</span>
                      )}
                    </div>
                    {p.aiNotes && <p className="text-sm text-brand-slate break-words whitespace-pre-line">{p.aiNotes}</p>}
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold text-brand-navy">داوری انسانی</span>
                      {raw === null ? (
                        <span className="text-brand-slate">هنوز نمره‌ای ثبت نشده</span>
                      ) : (
                        <span className="fa-num text-brand-slate">نمرهٔ داوری {fa(round1(raw))} از ۱۰۰</span>
                      )}
                    </div>
                    <JuryScoreForm
                      productId={p.id}
                      values={{ juryWorks: p.juryWorks, juryValue: p.juryValue, juryPitch: p.juryPitch }}
                    />
                  </div>
                </article>
              );
            })
          )}
        </section>
      </Container>
    </>
  );
}
