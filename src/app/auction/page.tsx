export const metadata = { title: "حراج زنده · میدان بنیان‌گذاران تپسل" };
import { requireUser } from "@/lib/auth";
import { getPhase, phaseAtLeast } from "@/lib/phase";
import { Container, PageHeader, Locked, Coin } from "@/components/ui";
import { fa, coins } from "@/lib/persian";
import { ensureAuctions, listAuctions, currentOrNextAuctionId } from "@/lib/auction";
import { AuctionStage } from "./AuctionStage";

export const dynamic = "force-dynamic";

export default async function AuctionPage() {
  const user = await requireUser();
  const { phase } = await getPhase();

  if (!phaseAtLeast(phase, "AUCTION")) {
    return (
      <Container>
        <PageHeader eyebrow="حراج زنده" title="حراج زنده" desc="نسخه‌های ویژهٔ محصولات اینجا زنده حراج می‌شوند." />
        <Locked title="هنوز زود است" desc="حراج زنده از فاز «حراج زنده» شروع می‌شود." />
      </Container>
    );
  }

  await ensureAuctions();
  const [auctions, liveId] = await Promise.all([listAuctions(), currentOrNextAuctionId()]);

  const scheduled = auctions.filter((a) => a.status === "SCHEDULED");
  const ended = auctions.filter((a) => a.status === "ENDED");

  return (
    <Container>
      <PageHeader
        eyebrow="حراج زنده"
        title="حراج زنده"
        desc="نسخه‌های ویژهٔ محصولات، یکی‌یکی و به‌ترتیب، زنده حراج می‌شوند."
        action={
          <div className="card px-4 py-2 flex items-center gap-2">
            <span className="text-xs font-bold text-brand-slate">کیف خرید</span>
            <Coin n={user.buyWallet} />
          </div>
        }
      />

      {phase === "CLOSED" ? (
        <ResultsOnly ended={ended} />
      ) : (
        <>
          <AuctionStage
            initialId={liveId}
            currentUser={{
              id: user.id,
              nickname: user.nickname,
              teamId: user.teamId,
              buyWallet: user.buyWallet,
              power: user.power,
              powerUsed: user.powerUsed,
            }}
          />

          <div className="grid md:grid-cols-2 gap-6 mt-8">
            <div className="card p-5">
              <h3 className="font-black text-brand-navy mb-3">در صف</h3>
              {scheduled.length === 0 ? (
                <p className="text-sm text-brand-slate">حراجی در صف نیست.</p>
              ) : (
                <ul className="space-y-2 stagger">
                  {scheduled.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-xl bg-brand-ice px-3 py-2 text-sm">
                      <span className="font-bold text-brand-navy">
                        {fa(a.order + 1)}. {a.product.specialName} <span className="text-brand-slate font-medium">· {a.product.teamName}</span>
                      </span>
                      <span className="fa-num font-black">{coins(a.startPrice)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h3 className="font-black text-brand-navy mb-3">پایان‌یافته</h3>
              {ended.length === 0 ? (
                <p className="text-sm text-brand-slate">هنوز حراجی پایان نیافته است.</p>
              ) : (
                <ul className="space-y-2 stagger">
                  {ended.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-xl bg-brand-ice px-3 py-2 text-sm">
                      <span className="font-bold text-brand-navy">
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
          </div>
        </>
      )}
    </Container>
  );
}

function ResultsOnly({ ended }: { ended: Awaited<ReturnType<typeof listAuctions>> }) {
  return (
    <div className="card p-5">
      <h3 className="font-black text-brand-navy mb-3">نتایج حراج زنده</h3>
      {ended.length === 0 ? (
        <p className="text-sm text-brand-slate">حراجی برگزار نشد.</p>
      ) : (
        <ul className="space-y-2 stagger">
          {ended.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-xl bg-brand-ice px-3 py-2 text-sm">
              <span className="font-bold text-brand-navy">
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
