import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { requireUser } from "@/lib/auth";
import { getSettingInt } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { getIdeaDetail } from "@/lib/idea";
import { spendableBuyCoins } from "@/lib/market";
import { moduleStatusFor } from "@/lib/module-state";
import { getTrack } from "@/lib/track-data";
import { PageHeader, Container, Alert } from "@/components/ui";
import { ModuleClosed, ModuleReadOnly } from "@/components/ModuleState";
import { Avatar } from "@/components/Avatar";
import { AiTag } from "@/components/AiTag";
import { fa, coins, jdatetime } from "@/lib/persian";
import { AnalystCard } from "@/app/idea/AnalystCard";
import { Cover } from "@/app/idea/Cover";
import { InvestPanel } from "./InvestPanel";
import { InvestorList } from "./InvestorList";
import { WithdrawButton } from "./WithdrawButton";
import { peopleExample } from "@/lib/people-example";

// چت بررسی دقیق سنگین‌تر از بقیهٔ صفحه است (فرم + لیست پیام‌ها)؛ با next/dynamic
// از باندل اصلی صفحه جدا می‌شود تا بار اولیهٔ صفحهٔ حمایت سبک‌تر بماند.
const DueDiligenceChat = dynamic(() => import("./DueDiligenceChat").then((m) => m.DueDiligenceChat));

export async function generateMetadata({ params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const idea = await getIdeaDetail(ideaId, null);
  // عنوان ایدهٔ ثبت‌نشده (پیش‌نویس) نباید از طریق <title> نشت کند.
  return { title: idea?.title && idea.submittedAt ? `${idea.title} · حمایت` : "حمایت از ایده" };
}

export default async function IdeaDetailPage({ params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const user = await requireUser();

  const status = await moduleStatusFor("invest", user.teamId);
  if (status === "hidden") notFound();
  if (status === "closed") return <ModuleClosed moduleKey="invest" title="حمایت از ایده‌ها" />;

  const idea = await getIdeaDetail(ideaId, user.id);
  if (!idea || !idea.submittedAt) notFound();
  // ایدهٔ محور مخفی فقط برای خود تیم دیده می‌شود.
  const track = await getTrack(idea.trackId);
  if (track?.status === "hidden" && !idea.isOwnTeam) notFound();

  const aiOff = !process.env.ANTHROPIC_API_KEY;
  const interactive = status === "open";
  const [spendable, supportCap] = await Promise.all([
    spendableBuyCoins(user.id, user.buyWallet),
    getSettingInt("support_cap", DEFAULTS.supportCap),
  ]);
  const supporterCount = new Set(idea.investments.map((i) => i.userId)).size;

  // تا وقتی حمایت باز است مبلغ هر حامی پنهان است (جز برای اعضای خود تیم)؛ پس از آن همه می‌بینند.
  const revealed = !interactive || idea.isOwnTeam;
  // تاریخچهٔ تغییرات برای کسانی که حمایت کرده‌اند و خود تیم
  const showRevisions = idea.revisions.length > 0 && (idea.viewerInvested > 0 || idea.isOwnTeam);

  return (
    <>
      <PageHeader eyebrow={track ? `حمایت از ایده‌ها · ${track.name}` : "حمایت از ایده‌ها"} title={idea.title} desc={idea.oneLiner} />
      {status === "ro" && (
        <Container className="mb-6">
          <ModuleReadOnly moduleKey="invest" />
        </Container>
      )}
      <Container className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* عنوان بخش برای ترتیب درست سرتیترها (h1 ← h2 ← h3 کارت‌ها)؛ ظاهر صفحه تغییری نمی‌کند */}
          <h2 className="sr-only">جزئیات ایده</h2>
          {idea.coverUrl && (
            <div className="relative w-full aspect-[8/5] rounded-3xl overflow-hidden border border-brand-mist anim-rise">
              <Cover src={idea.coverUrl} alt={idea.title} sizes="(max-width: 1024px) 100vw, 800px" />
            </div>
          )}

          <div className="card p-6 space-y-4 anim-rise">
            <div className="flex items-center gap-2">
              <Avatar seed={idea.teamLogoSeed || idea.teamId} size={28} />
              <span className="font-bold text-brand-navy break-words">{idea.teamName}</span>
              {idea.isOwnTeam && <span className="chip-red">تیم خودت</span>}
            </div>
            <AiTag tag={idea.aiTag} />
            <div>
              <div className="text-xs font-bold text-brand-slate mb-1">مسئله</div>
              <p className="text-brand-navy leading-7 break-words">{idea.problem}</p>
            </div>
            <div>
              <div className="text-xs font-bold text-brand-slate mb-1">مخاطب</div>
              <p className="text-brand-navy leading-7 break-words">{idea.audience}</p>
            </div>
            <div>
              <div className="text-xs font-bold text-brand-slate mb-1">برنامهٔ ساخت</div>
              <p className="text-brand-navy leading-7 break-words">{idea.buildPlan}</p>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <span className="chip-navy">{fa(supporterCount)} حامی</span>
              <span className="chip-gold">{coins(idea.raised)} حمایت</span>
              {idea.editedAt && <span className="chip-cyan">آخرین ویرایش: {jdatetime(idea.editedAt)}</span>}
            </div>
          </div>

          <AnalystCard
            clarity={idea.analystClarity}
            feasibility={idea.analystFeasibility}
            novelty={idea.analystNovelty}
            summary={idea.analystSummary}
            advice={idea.analystAdvice}
            aiOff={aiOff}
          />

          {showRevisions && (
            <div className="card p-6 space-y-3 anim-rise">
              <h3 className="font-black text-brand-navy">تاریخچهٔ تغییرات ایده</h3>
              <p className="text-xs text-brand-slate leading-6">نسخه‌های قبلی این ایده؛ جدیدترین اول. متن بالا نسخهٔ فعلی است.</p>
              <div className="space-y-2">
                {idea.revisions.map((r) => (
                  <details key={r.id} className="rounded-2xl bg-brand-ice px-4 py-3">
                    <summary className="cursor-pointer text-sm font-bold text-brand-navy">
                      {r.title} <span className="font-medium text-brand-slate">· {jdatetime(r.createdAt)}</span>
                    </summary>
                    <dl className="mt-3 space-y-2 text-sm text-brand-navy leading-7">
                      <div><dt className="text-xs font-bold text-brand-slate">یک‌خطی</dt><dd className="break-words">{r.oneLiner}</dd></div>
                      <div><dt className="text-xs font-bold text-brand-slate">مسئله</dt><dd className="break-words whitespace-pre-line">{r.problem}</dd></div>
                      <div><dt className="text-xs font-bold text-brand-slate">مخاطب</dt><dd className="break-words whitespace-pre-line">{r.audience}</dd></div>
                      <div><dt className="text-xs font-bold text-brand-slate">برنامهٔ ساخت</dt><dd className="break-words whitespace-pre-line">{r.buildPlan}</dd></div>
                    </dl>
                  </details>
                ))}
              </div>
            </div>
          )}

          <DueDiligenceChat ideaId={idea.id} chats={idea.chats} aiOff={aiOff} closed={!interactive} />
        </div>

        <div className="space-y-6">
          <div className="card p-6 space-y-4 anim-rise">
            <h2 className="font-black text-brand-navy">حمایت از این ایده</h2>
            <p className="text-xs text-brand-slate leading-6">
              تعداد حامی‌ها مهم‌تر از مبلغ است: {peopleExample(supportCap)}
            </p>
            {idea.viewerInvested > 0 && (
              <Alert kind="ok">تا الان {coins(idea.viewerInvested)} از این ایده حمایت کرده‌ای.</Alert>
            )}
            {interactive && idea.viewerWithdrawable > 0 && <WithdrawButton ideaId={idea.id} amount={idea.viewerWithdrawable} />}
            {idea.isOwnTeam ? (
              <Alert kind="info">نمی‌توانی از ایدهٔ تیم خودت حمایت کنی؛ ایده‌ات را به بقیه معرفی کن تا حامی جمع کنی.</Alert>
            ) : interactive ? (
              <InvestPanel
                ideaId={idea.id}
                spendable={spendable}
                alreadyGiven={idea.viewerInvested}
                supportCap={supportCap}
              />
            ) : (
              <Alert kind="info">حمایت از ایده‌ها الان باز نیست.</Alert>
            )}
          </div>

          <InvestorList investments={idea.investments} revealed={revealed} />
        </div>
      </Container>
    </>
  );
}
