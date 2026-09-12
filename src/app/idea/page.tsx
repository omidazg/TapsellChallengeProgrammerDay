import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { getPhase, phaseIndex } from "@/lib/phase";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty, Locked, Alert } from "@/components/ui";
import { fa, coins } from "@/lib/persian";
import { IdeaForm, UnsubmitButton } from "./IdeaForm";
import { AnalystCard } from "./AnalystCard";

export const metadata = { title: "اتاق ایده" };

export default async function IdeaPage() {
  const user = await requireUser();
  const { phase } = await getPhase();

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
        <PageHeader eyebrow="فاز فعلی" title="اتاق ایده" />
        <Container>
          <Locked title="هنوز زود است" desc="اتاق ایده از فاز «اتاق ایده» باز می‌شود." />
        </Container>
      </>
    );
  }

  const idea = await prisma.idea.findUnique({ where: { teamId: user.teamId } });
  const isIdeation = phase === "IDEATION";

  if (isIdeation && !idea?.submittedAt) {
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
        <Container>
          <Empty title="ایده‌ای ثبت نشده" desc="تیم شما ایده‌ای برای این دوره ثبت نکرده است." />
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
        action={isIdeation ? <UnsubmitButton /> : undefined}
      />
      <Container className="max-w-3xl space-y-6">
        {isIdeation && (
          <Alert kind="ok">ایده ثبت نهایی شده است. تا پایان فاز اتاق ایده می‌توانی برای ویرایش دوباره آن را باز کنی.</Alert>
        )}

        {idea.coverUrl && (
          <div className="relative w-full aspect-[8/5] rounded-3xl overflow-hidden border border-brand-mist anim-rise">
            <Image src={idea.coverUrl} alt={idea.title} fill sizes="800px" className="object-cover" unoptimized />
          </div>
        )}

        <div className="card p-6 space-y-4 anim-rise">
          <div>
            <div className="text-xs font-bold text-brand-slate mb-1">مسئله</div>
            <p className="text-brand-navy leading-7">{idea.problem}</p>
          </div>
          <div>
            <div className="text-xs font-bold text-brand-slate mb-1">مخاطب</div>
            <p className="text-brand-navy leading-7">{idea.audience}</p>
          </div>
          <div>
            <div className="text-xs font-bold text-brand-slate mb-1">برنامهٔ ساخت ۴۸ ساعته</div>
            <p className="text-brand-navy leading-7">{idea.buildPlan}</p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <span className="chip-navy">سقف سرمایه: {coins(idea.fundingCap)}</span>
            <span className="chip-cyan">سهم سود سرمایه‌گذار: {fa(idea.revenueShare)}٪</span>
          </div>
        </div>

        <AnalystCard clarity={idea.analystClarity} feasibility={idea.analystFeasibility} novelty={idea.analystNovelty} summary={idea.analystSummary} />
      </Container>
    </>
  );
}
