import Image from "next/image";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPhase, getSettingInt, phaseIndex } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { getIdeaDetail, lowestRaisedIdeaId } from "@/lib/idea";
import { PageHeader, Container, Locked, Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { fa, coins } from "@/lib/persian";
import { AnalystCard } from "@/app/idea/AnalystCard";
import { InvestPanel, AngelButton } from "./InvestPanel";
import { InvestorList } from "./InvestorList";
import { DueDiligenceChat } from "./DueDiligenceChat";

export default async function IdeaDetailPage({ params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const user = await requireUser();
  const { phase } = await getPhase();

  if (phaseIndex(phase) < phaseIndex("SEED_ROUND")) {
    return (
      <Container className="pt-10">
        <Locked title="هنوز زود است" desc="طبقهٔ سرمایه‌گذاری از فاز «دور سرمایه‌گذاری» باز می‌شود." />
      </Container>
    );
  }

  const idea = await getIdeaDetail(ideaId, user.id);
  if (!idea || !idea.submittedAt) notFound();

  const interactive = phase === "SEED_ROUND";
  const maxPerTarget = await getSettingInt("max_per_target", DEFAULTS.maxPerTarget);
  const maxAllowed = Math.max(0, Math.min(maxPerTarget - idea.viewerInvested, user.seedWallet));

  const revealed = !interactive || (user.power === "INSIDER" && user.powerUsed);
  const canReveal = interactive && user.power === "INSIDER" && !user.powerUsed;

  let canAngel = false;
  if (interactive && user.power === "ANGEL" && !user.powerUsed) {
    const lowest = await lowestRaisedIdeaId(user.teamId);
    canAngel = lowest === ideaId;
  }

  const pct = idea.fundingCap > 0 ? Math.min(100, Math.round((idea.raised / idea.fundingCap) * 100)) : 0;

  return (
    <>
      <PageHeader eyebrow="طبقهٔ سرمایه‌گذاری" title={idea.title} desc={idea.oneLiner} />
      <Container className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {idea.coverUrl && (
            <div className="relative w-full aspect-[8/5] rounded-3xl overflow-hidden border border-brand-mist anim-rise">
              <Image src={idea.coverUrl} alt={idea.title} fill sizes="800px" className="object-cover" unoptimized />
            </div>
          )}

          <div className="card p-6 space-y-4 anim-rise">
            <div className="flex items-center gap-2">
              <Avatar seed={idea.teamLogoSeed || idea.teamId} size={28} />
              <span className="font-bold text-brand-navy">{idea.teamName}</span>
              {idea.isOwnTeam && <span className="chip-red">تیم خودت</span>}
            </div>
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
              <span className="chip-gold">سود سرمایه‌گذار {fa(idea.revenueShare)}٪</span>
              <span className="chip-navy">سقف سرمایه: {coins(idea.fundingCap)}</span>
            </div>
            <div>
              <div className="h-2.5 rounded-pill bg-brand-sky overflow-hidden">
                <div className="h-full rounded-pill bg-brand-red" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-brand-slate fa-num">
                <span>{coins(idea.raised)} جذب‌شده</span>
                <span>از {coins(idea.fundingCap)}</span>
              </div>
            </div>
          </div>

          <AnalystCard clarity={idea.analystClarity} feasibility={idea.analystFeasibility} novelty={idea.analystNovelty} summary={idea.analystSummary} />

          <DueDiligenceChat ideaId={idea.id} chats={idea.chats} />
        </div>

        <div className="space-y-6">
          <div className="card p-6 space-y-4 anim-rise">
            <h3 className="font-black text-brand-navy">سرمایه‌گذاری</h3>
            {interactive ? (
              <InvestPanel ideaId={idea.id} seedWallet={user.seedWallet} maxAllowed={maxAllowed} isOwnTeam={idea.isOwnTeam} />
            ) : (
              <Alert kind="info">دور سرمایه‌گذاری تمام شده است.</Alert>
            )}
          </div>

          {canAngel && <AngelButton ideaId={idea.id} />}

          <InvestorList investments={idea.investments} revealed={revealed} canReveal={canReveal} />
        </div>
      </Container>
    </>
  );
}
