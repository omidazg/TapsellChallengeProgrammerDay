import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getPhase, phaseIndex, PHASE_LABEL } from "@/lib/phase";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty, Locked, Alert } from "@/components/ui";
import { AiTag } from "@/components/AiTag";
import { ideaAiTag } from "@/lib/ai-tag";
import { teamAccess } from "@/lib/team-access";
import { IdeaForm, UnsubmitButton } from "./IdeaForm";
import { AnalystCard } from "./AnalystCard";
import { Cover } from "./Cover";
import { AI_EVAL_CAP_PER_PHASE, aiEvalCount } from "@/lib/ai";

export const metadata = { title: "اتاق ایده" };

export default async function IdeaPage() {
  const user = await requireUser();
  const { phase } = await getPhase();
  const aiOff = !process.env.ANTHROPIC_API_KEY;

  if (!user.teamId) {
    return (
      <>
        <PageHeader eyebrow="فاز فعلی" title="اتاق ایده" desc="اینجا ایدهٔ تیمت را می‌نویسی و برای «دور حمایت» ثبت می‌کنی." />
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

  if (phaseIndex(phase) < phaseIndex("IDEATION")) {
    return (
      <>
        <PageHeader
          eyebrow={`از فاز «${PHASE_LABEL.IDEATION}» باز می‌شود`}
          title="اتاق ایده"
          action={
            <Link href="/" className="btn-ghost">
              الان چه کنم؟
            </Link>
          }
        />
        <Container>
          <Locked title="هنوز زود است" desc="اتاق ایده از فاز «اتاق ایده» باز می‌شود." />
        </Container>
      </>
    );
  }

  const idea = await prisma.idea.findUnique({ where: { teamId: user.teamId } });
  const isIdeation = phase === "IDEATION";
  // هر عضو تیم (یا شرکت‌کنندهٔ فردی) ایده را می‌نویسد و ویرایش می‌کند.
  const { canManage, reason } = await teamAccess(user);

  if (isIdeation && !idea?.submittedAt && canManage) {
    return (
      <>
        <PageHeader
          eyebrow="فاز فعلی"
          title="اتاق ایده"
          desc={`ایدهٔ تیمت را بنویس و پیش از پایان فاز ثبت نهایی کن تا در «${PHASE_LABEL.SEED_ROUND}» دیده شود و حامی جمع کند. هر عضو تیم می‌تواند ویرایشش کند.`}
        />
        <Container className="max-w-3xl">
          <IdeaForm
            draftKey={`${user.teamId}:${idea?.id ?? "new"}`}
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
        </Container>
      </>
    );
  }

  if (!idea) {
    return (
      <>
        <PageHeader eyebrow="فاز فعلی" title="اتاق ایده" />
        <Container className="space-y-4">
          {isIdeation && reason && <Alert kind="info">{reason}</Alert>}
          <Empty title="ایده‌ای ثبت نشده" desc={isIdeation ? undefined : "تیمت برای این دوره ایده‌ای ثبت نکرده است."} />
        </Container>
      </>
    );
  }

  const aiTag = ideaAiTag(idea);
  // سقف تحلیل هوش مصنوعی در این فاز پر شده؟ (ثبت دوباره نمرهٔ قبلی را نگه می‌دارد)
  const analystCapReached =
    isIdeation && canManage && !!idea.submittedAt && (await aiEvalCount("analyst", idea.id, phase)) >= AI_EVAL_CAP_PER_PHASE;

  return (
    <>
      <PageHeader
        eyebrow="فاز فعلی"
        title={idea.title}
        desc={idea.oneLiner}
        action={isIdeation && canManage && idea.submittedAt ? <UnsubmitButton /> : undefined}
      />
      <Container className="max-w-3xl space-y-6">
        {isIdeation && idea.submittedAt && canManage && (
          <Alert kind="ok">ایده ثبت نهایی شده است. تا پایان فاز اتاق ایده هر عضو تیم می‌تواند برای ویرایش دوباره آن را باز کند.</Alert>
        )}
        {analystCapReached && (
          <Alert kind="info">
            سقف {AI_EVAL_CAP_PER_PHASE.toLocaleString("fa-IR")} بار تحلیل هوش مصنوعی برای این ایده در این فاز پر شده است؛ اگر دوباره ثبت کنی، تحلیل اجرا نمی‌شود و نمرهٔ فعلی حفظ می‌شود.
          </Alert>
        )}
        {isIdeation && !idea.submittedAt && <Alert kind="info">این پیش‌نویس هنوز ثبت نهایی نشده.</Alert>}
        {!isIdeation && !idea.submittedAt && (
          <Alert kind="error">
            این ایده پیش از پایان فاز «اتاق ایده» ثبت نهایی نشد و در «{PHASE_LABEL.SEED_ROUND}» نمایش داده نمی‌شود.
          </Alert>
        )}

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
            <div className="text-xs font-bold text-brand-slate mb-1">برنامهٔ ساخت ۴۸ ساعته</div>
            <p className="text-brand-navy leading-7 break-words whitespace-pre-line">{idea.buildPlan}</p>
          </div>
        </div>

        <AnalystCard clarity={idea.analystClarity} feasibility={idea.analystFeasibility} novelty={idea.analystNovelty} summary={idea.analystSummary} aiOff={aiOff} />
      </Container>
    </>
  );
}
