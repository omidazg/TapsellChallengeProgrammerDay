import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPhase } from "@/lib/phase";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty, Alert } from "@/components/ui";
import { ModuleClosed, ModuleReadOnly } from "@/components/ModuleState";
import { TrackSwitcher } from "@/components/TrackSwitcher";
import { TrackProgress } from "@/components/TrackProgress";
import { AiTag } from "@/components/AiTag";
import { ideaAiTag } from "@/lib/ai-tag";
import { teamAccess } from "@/lib/team-access";
import { moduleStatusFor, trackGate } from "@/lib/module-state";
import { resolveTrack } from "@/lib/track-data";
import { IdeaForm, UnsubmitButton } from "./IdeaForm";
import { AnalystCard } from "./AnalystCard";
import { Cover } from "./Cover";
import { AI_EVAL_CAP_PER_PHASE, aiEvalCount } from "@/lib/ai";

export const metadata = { title: "ثبت ایده" };

const TITLE = "ثبت ایده";

export default async function IdeaPage({ searchParams }: { searchParams: Promise<{ track?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const aiOff = !process.env.ANTHROPIC_API_KEY;

  const status = await moduleStatusFor("idea", user.teamId);
  if (status === "hidden") notFound();
  if (status === "closed") return <ModuleClosed moduleKey="idea" title={TITLE} />;

  if (!user.teamId) {
    return (
      <>
        <PageHeader title={TITLE} desc="اینجا ایدهٔ تیمت را می‌نویسی و ثبت می‌کنی تا بقیه ببینند و از آن حمایت کنند." />
        <Container>
          <Empty
            title="هنوز عضو تیمی نیستی"
            desc="برای ثبت ایده، یک تیم بساز، به تیمی بپیوند یا «شرکت فردی» را انتخاب کن."
            cta={{ href: "/team", label: "رفتن به اتاق تیم" }}
          />
        </Container>
      </>
    );
  }

  const { track, tracks } = await resolveTrack(sp.track);
  if (!track) {
    return (
      <>
        <PageHeader title={TITLE} />
        <Container>
          <Empty title="فعلاً محوری باز نیست" desc="به‌محض باز شدن محورها می‌توانی ایده‌ات را ثبت کنی." />
        </Container>
      </>
    );
  }

  const key = { teamId_trackId: { teamId: user.teamId, trackId: track.id } };
  const [idea, product, trackError, { canManage, reason }, { phase }] = await Promise.all([
    prisma.idea.findUnique({ where: key }),
    prisma.product.findUnique({ where: key, select: { submittedAt: true, liveStatus: true } }),
    trackGate(track.id, user.teamId),
    teamAccess(user),
    getPhase(),
  ]);
  // هر عضو تیم (یا شرکت‌کنندهٔ فردی) ایده را می‌نویسد و ویرایش می‌کند.
  const editable = status === "open" && !trackError && canManage;

  const nav = (
    <>
      <TrackSwitcher tracks={tracks} current={track.id} hrefFor={(id) => `/idea?track=${encodeURIComponent(id ?? track.id)}`} />
      <TrackProgress
        trackId={track.id}
        hasTeam
        ideaSubmitted={!!idea?.submittedAt}
        productSubmitted={!!product?.submittedAt}
        publish={track.kind === "PRODUCT" ? { requested: !!product?.liveStatus } : null}
      />
      {status === "ro" && <ModuleReadOnly moduleKey="idea" />}
      {trackError && <Alert kind="info">{trackError}</Alert>}
    </>
  );
  const analyst = idea && (
    <AnalystCard
      clarity={idea.analystClarity}
      feasibility={idea.analystFeasibility}
      novelty={idea.analystNovelty}
      summary={idea.analystSummary}
      advice={idea.analystAdvice}
      aiOff={aiOff}
    />
  );

  if (editable && !idea?.submittedAt) {
    return (
      <>
        <PageHeader
          eyebrow={track.name}
          title={TITLE}
          desc={`${track.description ? `${track.description} ` : ""}ایده‌ات را بنویس و ثبت نهایی کن تا دیده شود، حامی جمع کند و مرکز ساخت همین محور برایت باز شود. هر عضو تیم می‌تواند ویرایشش کند.`}
        />
        <Container className="max-w-3xl space-y-6">
          {nav}
          {idea && <Alert kind="info">این پیش‌نویس هنوز ثبت نهایی نشده و دیگران آن را نمی‌بینند.</Alert>}
          <IdeaForm
            key={track.id}
            trackId={track.id}
            draftKey={`${user.teamId}:${track.id}:${idea?.id ?? "new"}`}
            initial={
              idea
                ? {
                    title: idea.title,
                    oneLiner: idea.oneLiner,
                    problem: idea.problem,
                    audience: idea.audience,
                    buildPlan: idea.buildPlan,
                    coverUrl: idea.coverUrl,
                  }
                : null
            }
          />
          {/* بازخورد تحلیل‌گر کنار فرم می‌ماند تا تیم با دیدن آن ایده را بهتر کند */}
          {analyst}
        </Container>
      </>
    );
  }

  if (!idea) {
    return (
      <>
        <PageHeader eyebrow={track.name} title={TITLE} />
        <Container className="max-w-3xl space-y-6">
          {nav}
          {reason && <Alert kind="info">{reason}</Alert>}
          <Empty title="ایده‌ای ثبت نشده" desc="تیمت در این محور ایده‌ای ثبت نکرده است." />
        </Container>
      </>
    );
  }

  const aiTag = ideaAiTag(idea);
  // سقف تحلیل هوش مصنوعی پر شده؟ (ثبت دوباره نمرهٔ قبلی را نگه می‌دارد)
  const analystCapReached = editable && !!idea.submittedAt && (await aiEvalCount("analyst", idea.id, phase)) >= AI_EVAL_CAP_PER_PHASE;

  return (
    <>
      <PageHeader
        eyebrow={track.name}
        title={idea.title}
        desc={idea.oneLiner}
        action={editable && idea.submittedAt ? <UnsubmitButton trackId={track.id} /> : undefined}
      />
      <Container className="max-w-3xl space-y-6">
        {nav}
        {editable && idea.submittedAt && (
          <Alert kind="ok">
            ایده ثبت نهایی شده است و هر عضو تیم می‌تواند آن را برای ویرایش باز کند. اگر بعد از گرفتن حمایت ایده را تغییر دهی،
            تاریخچهٔ تغییرات به حامی‌ها نشان داده می‌شود و می‌توانند حمایتشان را پس بگیرند.
          </Alert>
        )}
        {analystCapReached && (
          <Alert kind="info">
            سقف {AI_EVAL_CAP_PER_PHASE.toLocaleString("fa-IR")} بار تحلیل هوش مصنوعی برای این ایده پر شده است؛ اگر دوباره ثبت کنی، تحلیل اجرا نمی‌شود و نمرهٔ فعلی حفظ می‌شود.
          </Alert>
        )}
        {!idea.submittedAt && <Alert kind="info">این پیش‌نویس هنوز ثبت نهایی نشده و دیگران آن را نمی‌بینند.</Alert>}

        {idea.coverUrl && (
          <div className="relative w-full aspect-[8/5] rounded-3xl overflow-hidden border border-brand-mist anim-rise">
            <Cover src={idea.coverUrl} alt={idea.title} sizes="800px" />
          </div>
        )}

        <div className="card p-6 space-y-4 anim-rise">
          <AiTag tag={aiTag} />
          <div>
            <div className="text-xs font-bold text-brand-slate mb-1">مسئله</div>
            <p className="text-brand-navy leading-7 break-words whitespace-pre-line">{idea.problem}</p>
          </div>
          <div>
            <div className="text-xs font-bold text-brand-slate mb-1">مخاطب</div>
            <p className="text-brand-navy leading-7 break-words whitespace-pre-line">{idea.audience}</p>
          </div>
          <div>
            <div className="text-xs font-bold text-brand-slate mb-1">برنامهٔ ساخت</div>
            <p className="text-brand-navy leading-7 break-words whitespace-pre-line">{idea.buildPlan}</p>
          </div>
        </div>

        {analyst}
      </Container>
    </>
  );
}
