import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { requireUser } from "@/lib/auth";
import { getPhase, getSettingInt, phaseIndex } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { getIdeaDetail } from "@/lib/idea";
import { PageHeader, Container, Locked, Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { fa, coins } from "@/lib/persian";
import { AnalystCard } from "@/app/idea/AnalystCard";
import { Cover } from "@/app/idea/Cover";
import { InvestPanel } from "./InvestPanel";
import { InvestorList } from "./InvestorList";

// چت بررسی دقیق سنگین‌تر از بقیهٔ صفحه است (فرم + لیست پیام‌ها)؛ با next/dynamic
// از باندل اصلی صفحه جدا می‌شود تا بار اولیهٔ صفحهٔ سرمایه‌گذاری سبک‌تر بماند.
const DueDiligenceChat = dynamic(() => import("./DueDiligenceChat").then((m) => m.DueDiligenceChat));

export async function generateMetadata({ params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const idea = await getIdeaDetail(ideaId, null);
  return { title: idea?.title ? `${idea.title} · سرمایه‌گذاری` : "سرمایه‌گذاری" };
}

export default async function IdeaDetailPage({ params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const user = await requireUser();
  const { phase } = await getPhase();

  if (phaseIndex(phase) < phaseIndex("SEED_ROUND")) {
    return (
      <>
        <PageHeader eyebrow="طبقهٔ سرمایه‌گذاری" title="سرمایه‌گذاری" />
        <Container>
          <Locked title="هنوز زود است" desc="طبقهٔ سرمایه‌گذاری از فاز «دور سرمایه‌گذاری» باز می‌شود." />
        </Container>
      </>
    );
  }

  const idea = await getIdeaDetail(ideaId, user.id);
  if (!idea || !idea.submittedAt) notFound();

  const aiOff = !process.env.ANTHROPIC_API_KEY;
  const interactive = phase === "SEED_ROUND";
  const maxPerTarget = await getSettingInt("max_per_target", DEFAULTS.maxPerTarget);
  // «هدف جذب سرمایه» دیگر سقف سخت نیست؛ محدودیت واقعی فقط سقف هر نفر روی هر ایده و موجودی کیف بذر است.
  const maxAllowed = Math.max(0, Math.min(maxPerTarget - idea.viewerInvested, user.seedWallet));

  // در دور بذر مبالغ پنهان‌اند، مگر برای «خبرچین» فعال‌شده یا اعضای خود تیم.
  const revealed = !interactive || idea.isOwnTeam || (user.power === "INSIDER" && user.powerUsed);
  const canReveal = interactive && user.power === "INSIDER" && !user.powerUsed;

  const rawPct = idea.fundingCap > 0 ? Math.round((idea.raised / idea.fundingCap) * 100) : 0;
  const pct = Math.min(100, rawPct);
  const overGoal = rawPct > 100;

  return (
    <>
      <PageHeader eyebrow="طبقهٔ سرمایه‌گذاری" title={idea.title} desc={idea.oneLiner} />
      <Container className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {idea.coverUrl && (
            <div className="relative w-full aspect-[8/5] rounded-3xl overflow-hidden border border-brand-mist anim-rise">
              <Cover src={idea.coverUrl} alt={idea.title} sizes="800px" />
            </div>
          )}

          <div className="card p-6 space-y-4 anim-rise">
            <div className="flex items-center gap-2">
              <Avatar seed={idea.teamLogoSeed || idea.teamId} size={28} />
              <span className="font-bold text-brand-navy break-words">{idea.teamName}</span>
              {idea.isOwnTeam && <span className="chip-red">تیم خودت</span>}
            </div>
            <div>
              <div className="text-xs font-bold text-brand-slate mb-1">مسئله</div>
              <p className="text-brand-navy leading-7 break-words">{idea.problem}</p>
            </div>
            <div>
              <div className="text-xs font-bold text-brand-slate mb-1">مخاطب</div>
              <p className="text-brand-navy leading-7 break-words">{idea.audience}</p>
            </div>
            <div>
              <div className="text-xs font-bold text-brand-slate mb-1">برنامهٔ ساخت ۴۸ ساعته</div>
              <p className="text-brand-navy leading-7 break-words">{idea.buildPlan}</p>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <span className="chip-gold">سود سرمایه‌گذار {fa(idea.revenueShare)}٪</span>
              <span className="chip-navy">هدف جذب سرمایه: {coins(idea.fundingCap)}</span>
              {overGoal && <span className="chip-red">بیش از هدف 🔥</span>}
            </div>
            <div>
              <div className="h-2.5 rounded-pill bg-brand-sky overflow-hidden">
                <div className="h-full rounded-pill bg-brand-red" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-brand-slate fa-num">
                <span>{coins(idea.raised)} جذب‌شده</span>
                <span>از هدف {coins(idea.fundingCap)}</span>
              </div>
            </div>
            <p className="text-xs text-brand-slate">
              هرچه سرمایهٔ بیشتری روی این ایده جمع شود، سهم هر سرمایه‌گذار از استخر سود (فروش × {fa(idea.revenueShare)}٪)
              کوچک‌تر می‌شود، چون این استخر متناسب با مبلغ هرکس بین همهٔ سرمایه‌گذاران تقسیم می‌شود.
            </p>
          </div>

          <AnalystCard
            clarity={idea.analystClarity}
            feasibility={idea.analystFeasibility}
            novelty={idea.analystNovelty}
            summary={idea.analystSummary}
            aiOff={aiOff}
          />

          <DueDiligenceChat ideaId={idea.id} chats={idea.chats} aiOff={aiOff} />
        </div>

        <div className="space-y-6">
          <div className="card p-6 space-y-4 anim-rise">
            <h3 className="font-black text-brand-navy">سرمایه‌گذاری</h3>
            {idea.isOwnTeam ? (
              <Alert kind="info">
                نمی‌توانی روی ایدهٔ تیم خودت سرمایه‌گذاری کنی. برای جذب سرمایه، منتظر سرمایه‌گذاران تیم‌های دیگر باش.
              </Alert>
            ) : interactive ? (
              <InvestPanel ideaId={idea.id} seedWallet={user.seedWallet} maxAllowed={maxAllowed} />
            ) : (
              <Alert kind="info">دور سرمایه‌گذاری تمام شده است.</Alert>
            )}
          </div>

          <InvestorList ideaId={idea.id} investments={idea.investments} revealed={revealed} canReveal={canReveal} />
        </div>
      </Container>
    </>
  );
}
