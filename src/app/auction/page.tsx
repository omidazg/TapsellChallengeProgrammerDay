export const metadata = { title: "حراج زنده" };
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPhase, getSettingInt, phaseAtLeast } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { Container, PageHeader, Locked, Coin } from "@/components/ui";
import { fa, coins } from "@/lib/persian";
import { listAuctions, currentOrNextAuctionId, getBidBudget } from "@/lib/auction";
import { AuctionStage } from "./AuctionStage";

export const dynamic = "force-dynamic";

type AuctionItem = Awaited<ReturnType<typeof listAuctions>>[number];

export default async function AuctionPage() {
  const user = await requireUser();
  const { phase } = await getPhase();

  if (!phaseAtLeast(phase, "MARKET")) {
    return (
      <Container>
        <PageHeader eyebrow="حراج زنده" title="حراج زنده" desc="نسخه‌های ویژهٔ محصولات در «روز بازار» یکی‌یکی زنده حراج می‌شوند." />
        <Locked title="هنوز زود است" desc="حراج زنده در فاز «روز بازار» برگزار می‌شود؛ تیم‌ها همان موقع محصولشان را از صفحهٔ محصول به صف حراج می‌فرستند." />
      </Container>
    );
  }

  const [auctions, liveId, cutoffMin, myProduct] = await Promise.all([
    listAuctions(),
    currentOrNextAuctionId(),
    getSettingInt("auction_enqueue_cutoff_min", DEFAULTS.auctionEnqueueCutoffMin),
    user.teamId
      ? prisma.product.findUnique({ where: { teamId: user.teamId }, select: { submittedAt: true, auction: { select: { id: true } } } })
      : Promise.resolve(null),
  ]);
  // بودجهٔ خصوصی کاربر (موجودی/رزرو/قابل‌خرج) برای حراج جاری؛ جدا از وضعیت عمومی و کش مشترک حراج.
  const initialBudget = phase === "CLOSED" ? null : await getBidBudget(user.id, liveId);

  const scheduled = auctions.filter((a) => a.status === "SCHEDULED");
  const ended = auctions.filter((a) => a.status === "ENDED");
  // محصول ثبت‌شدهٔ تیمِ کاربر که هنوز به صف نرفته: میان‌بر به صفحهٔ محصول برای «فرستادن به حراج».
  const canEnqueueOwn = phase === "MARKET" && !!user.team && !!myProduct?.submittedAt && !myProduct.auction;

  return (
    <Container>
      <PageHeader
        eyebrow="روز بازار"
        title="حراج زنده"
        desc="نسخه‌های ویژهٔ محصولات یکی‌یکی و به ترتیب صف زنده حراج می‌شوند؛ صف از قبل پیداست، پس سکه‌هایت را برای حراج‌های بعدی هم نگه دار."
        action={
          <div className="card px-4 py-2 flex items-center gap-2">
            <span className="text-xs font-bold text-brand-slate">کیف سکه</span>
            <Coin n={user.buyWallet} />
          </div>
        }
      />

      {phase === "CLOSED" ? (
        <ResultsOnly ended={ended} />
      ) : (
        <>
          <div className="card p-4 sm:p-5 mb-6 bg-brand-ice space-y-2 text-sm text-brand-navy leading-7">
            <p>
              تیم‌ها محصولشان را از صفحهٔ محصول به صف حراج می‌فرستند؛ تا {fa(cutoffMin)} دقیقه پیش از پایان روز بازار. هر حراج که تمام شود،
              بعدی خودکار شروع می‌شود.
            </p>
            <p className="text-brand-slate">
              برندهٔ هر حراج همان مبلغ پیشنهادش را می‌پردازد و این برد مثل یک خرید، حمایت از آن تیم حساب می‌شود. روی نسخهٔ ویژهٔ تیم خودت
              نمی‌توانی پیشنهاد بدهی.
            </p>
            {canEnqueueOwn && user.team && (
              <Link href={`/market/${user.team.slug}`} className="btn-primary inline-flex !py-2">
                🔨 فرستادن محصول تیمت به حراج ←
              </Link>
            )}
          </div>

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
              <h3 className="font-black text-brand-navy mb-3">صف حراج</h3>
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
      <h3 className="font-black text-brand-navy mb-3">{title}</h3>
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
