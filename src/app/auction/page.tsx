export const metadata = { title: "حراج زنده" };
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettingInt } from "@/lib/phase";
import { moduleStatusFor } from "@/lib/module-state";
import { ModuleClosed, ModuleReadOnly } from "@/components/ModuleState";
import { AuctionEnqueue } from "@/app/market/[slug]/AuctionEnqueue";
import { DEFAULTS } from "@/lib/constants";
import { Container, PageHeader, Coin } from "@/components/ui";
import { fa, coins } from "@/lib/persian";
import { listAuctions, currentOrNextAuctionId, getBidBudget } from "@/lib/auction";
import { AuctionStage } from "./AuctionStage";

export const dynamic = "force-dynamic";

type AuctionItem = Awaited<ReturnType<typeof listAuctions>>[number];

export default async function AuctionPage() {
  const user = await requireUser();

  // حراج زنده بخشی از بازار است و از همان وضعیت پیروی می‌کند.
  const status = await moduleStatusFor("market", user.teamId);
  if (status === "hidden") notFound();
  if (status === "closed") return <ModuleClosed moduleKey="market" title="حراج زنده" />;
  const open = status === "open";

  const [auctions, liveId, cutoffMin, myProducts] = await Promise.all([
    listAuctions(),
    currentOrNextAuctionId(),
    getSettingInt("auction_enqueue_cutoff_min", DEFAULTS.auctionEnqueueCutoffMin),
    // محصول‌های ثبت‌شدهٔ تیم کاربر با نسخهٔ ویژه که هنوز به صف نرفته‌اند
    user.teamId && open
      ? prisma.product.findMany({
          where: { teamId: user.teamId, submittedAt: { not: null }, specialName: { not: "" }, auction: { is: null } },
          select: { trackId: true, name: true, track: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);
  // بودجهٔ خصوصی کاربر (موجودی/رزرو/قابل‌خرج) برای حراج جاری؛ جدا از وضعیت عمومی و کش مشترک حراج.
  const initialBudget = open ? await getBidBudget(user.id, liveId) : null;

  const scheduled = auctions.filter((a) => a.status === "SCHEDULED");
  const ended = auctions.filter((a) => a.status === "ENDED");

  return (
    <Container>
      <PageHeader
        eyebrow="بازار"
        title="حراج زنده"
        desc="نسخه‌های ویژهٔ محصولات یکی‌یکی و به ترتیب صف زنده حراج می‌شوند؛ صف از قبل پیداست، پس سکه‌هایت را برای حراج‌های بعدی هم نگه دار."
        action={
          <div className="card px-4 py-2 flex items-center gap-2">
            <span className="text-xs font-bold text-brand-slate">کیف سکه</span>
            <Coin n={user.buyWallet} />
          </div>
        }
      />

      {!open ? (
        <div className="space-y-4">
          <ModuleReadOnly moduleKey="market" />
          <ResultsOnly ended={ended} />
        </div>
      ) : (
        <>
          <div className="card p-4 sm:p-5 mb-6 bg-brand-ice space-y-2 text-sm text-brand-navy leading-7">
            <p>
              تیم‌ها محصولشان را از صفحهٔ محصول به صف حراج می‌فرستند؛ تا {fa(cutoffMin)} دقیقه پیش از پایان مسابقه. هر حراج که تمام شود،
              بعدی پس از فاصله‌ای کوتاه خودکار شروع می‌شود.
            </p>
            <p className="text-brand-slate">
              برندهٔ هر حراج همان مبلغ پیشنهادش را می‌پردازد و این برد مثل یک خرید، حمایت از آن تیم حساب می‌شود. روی نسخهٔ ویژهٔ تیم خودت
              نمی‌توانی پیشنهاد بدهی.
            </p>
            {myProducts.length > 0 && (
              <AuctionEnqueue
                cutoffMin={cutoffMin}
                options={myProducts.map((p) => ({ trackId: p.trackId, label: `${p.name} (${p.track.name})` }))}
              />
            )}
          </div>

          {/* سرتیتر پنهان بخش حراج جاری؛ کارت «فعلاً حراجی زنده نیست» h3 دارد و نباید بعد از h1 بیاید */}
          <h2 className="sr-only">حراج جاری</h2>
          <AuctionStage
            initialId={liveId}
            initialBudget={initialBudget}
            currentUser={{
              id: user.id,
              nickname: user.nickname,
              teamId: user.teamId,
              buyWallet: user.buyWallet,
            }}
          />

          <div className="grid md:grid-cols-2 gap-6 mt-8">
            <div className="card p-4 sm:p-6">
              <h2 className="font-black text-brand-navy mb-3">صف حراج</h2>
              {scheduled.length === 0 ? (
                <p className="text-sm text-brand-slate">فعلاً محصولی در صف نیست.</p>
              ) : (
                <ol className="space-y-2 stagger">
                  {scheduled.map((a, i) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-ice px-3 py-2 text-sm">
                      <span className="font-bold text-brand-navy break-words">
                        {fa(i + 1)}. {a.product.specialName} <span className="text-brand-slate font-medium">· {a.product.teamName}</span>
                        {user.teamId && a.product.teamId === user.teamId && <span className="chip-navy ms-2">تیم خودت</span>}
                      </span>
                      <span className="fa-num font-black">شروع از {coins(a.startPrice)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <EndedList ended={ended} title="پایان‌یافته" empty="هنوز حراجی پایان نیافته است." />
          </div>
        </>
      )}
    </Container>
  );
}

function ResultsOnly({ ended }: { ended: AuctionItem[] }) {
  return <EndedList ended={ended} title="نتایج حراج زنده" empty="حراجی برگزار نشد." />;
}

function EndedList({ ended, title, empty }: { ended: AuctionItem[]; title: string; empty: string }) {
  return (
    <div className="card p-4 sm:p-6">
      <h2 className="font-black text-brand-navy mb-3">{title}</h2>
      {ended.length === 0 ? (
        <p className="text-sm text-brand-slate">{empty}</p>
      ) : (
        <ul className="space-y-2 stagger">
          {ended.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-ice px-3 py-2 text-sm">
              <span className="font-bold text-brand-navy break-words">
                {a.product.specialName} <span className="text-brand-slate font-medium">· {a.product.teamName}</span>
              </span>
              <span className="text-left">
                {a.winnerNickname ? (
                  <>
                    <div className="text-xs text-brand-slate">{a.winnerNickname}</div>
                    <div className="fa-num font-black">{coins(a.finalPrice ?? 0)}</div>
                  </>
                ) : (
                  <span className="text-brand-slate text-xs">بدون برنده</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
