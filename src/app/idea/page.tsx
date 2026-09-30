import { requireUser } from "@/lib/auth";
import { getPhase, phaseIndex, PHASE_LABEL } from "@/lib/phase";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty, Locked, Alert } from "@/components/ui";
import { fa, coins } from "@/lib/persian";
import { IdeaForm, UnsubmitButton } from "./IdeaForm";
import { AnalystCard } from "./AnalystCard";
import { Cover } from "./Cover";
import { teamAccess } from "@/lib/leader";
import { LeaderNotice } from "@/components/LeaderNotice";

export const metadata = { title: "اتاق ایده" };

export default async function IdeaPage() {
  const user = await requireUser();
  const { phase } = await getPhase();
  const aiOff = !process.env.ANTHROPIC_API_KEY;

  if (!user.teamId) {
    return (
      <>
        <PageHeader eyebrow="فاز فعلی" title="اتاق ایده" desc="اینجا ایدهٔ تیمت را می‌نویسی و برای سرمایه‌گذاری ثبت می‌کنی." />
        <Container>
          <Empty title="هنوز عضو تیمی نیستی" desc="برای ثبت ایده، ابتدا باید عضو یک تیم سه‌نفره شوی." cta={{ href: "/team", label: "رفتن به اتاق تیم" }} />
        </Container>
      </>
    );
  }

  if (phaseIndex(phase) < phaseIndex("IDEATION")) {
    return (
      <>
        <PageHeader eyebrow={`از فاز «${PHASE_LABEL.IDEATION}» باز می‌شود`} title="اتاق ایده" />
        <Container>
          <Locked title="هنوز زود است" desc="اتاق ایده از فاز «اتاق ایده» باز می‌شود." />
        </Container>
      </>
    );
  }

  const idea = await prisma.idea.findUnique({ where: { teamId: user.teamId } });
  const isIdeation = phase === "IDEATION";
  const { canManage, reason } = await teamAccess(user);

  if (isIdeation && !idea?.submittedAt && canManage) {
    return (
      <>
        <PageHeader eyebrow="فاز فعلی" title="اتاق ایده" desc="ایدهٔ تیمت را بنویس و پیش از پایان فاز ثبت نهایی کن تا سرمایه‌گذاران آن را ببینند." />
        <Container className="max-w-3xl">
          <IdeaForm
            initial={
              idea
                ? {
                    title: idea.title,
                    oneLiner: idea.oneLiner,
                    problem: idea.problem,
                    audience: idea.audience,
                    buildPlan: idea.buildPlan,
                    coverUrl: idea.coverUrl,
                    fundingCap: idea.fundingCap,
                    revenueShare: idea.revenueShare,
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
          {isIdeation && <LeaderNotice reason={reason} />}
          <Empty
            title={isIdeation ? "سرپرست هنوز ایده‌ای ننوشته" : "ایده‌ای ثبت نشده"}
            desc={isIdeation ? "وقتی سرپرست پیش‌نویس ایده را ذخیره کند، همین‌جا می‌بینی." : "تیم شما ایده‌ای برای این دوره ثبت نکرده است."}
          />
        </Container>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="فاز فعلی"
        title={idea.title}
        desc={idea.oneLiner}
        action={isIdeation && canManage && idea.submittedAt ? <UnsubmitButton /> : undefined}
      />
      <Container className="max-w-3xl space-y-6">
        {isIdeation && <LeaderNotice reason={reason} />}
        {isIdeation && idea.submittedAt && canManage && (
          <Alert kind="ok">ایده ثبت نهایی شده است. تا پایان فاز اتاق ایده می‌توانی برای ویرایش دوباره آن را باز کنی.</Alert>
        )}
        {isIdeation && !idea.submittedAt && (
          <Alert kind="info">این پیش‌نویس سرپرست است و هنوز ثبت نهایی نشده.</Alert>
        )}
        {!isIdeation && !idea.submittedAt && (
          <Alert kind="error">این ایده پیش از پایان فاز «اتاق ایده» ثبت نهایی نشد و در طبقهٔ سرمایه‌گذاری نمایش داده نمی‌شود.</Alert>
        )}

        {idea.coverUrl && (
          <div className="relative w-full aspect-[8/5] rounded-3xl overflow-hidden border border-brand-mist anim-rise">
            <Cover src={idea.coverUrl} alt={idea.title} sizes="800px" />
          </div>
        )}

        <div className="card p-6 space-y-4 anim-rise">
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
          <div className="flex flex-wrap gap-3 pt-2">
            <span className="chip-navy">هدف جذب سرمایه: {coins(idea.fundingCap)}</span>
            <span className="chip-cyan">سهم سود سرمایه‌گذار: {fa(idea.revenueShare)}٪</span>
          </div>
        </div>

        <AnalystCard clarity={idea.analystClarity} feasibility={idea.analystFeasibility} novelty={idea.analystNovelty} summary={idea.analystSummary} aiOff={aiOff} />
      </Container>
    </>
  );
}
