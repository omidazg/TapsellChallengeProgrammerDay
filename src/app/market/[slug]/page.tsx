import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPhase, getSettingInt, phaseIndex } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { productAiTag } from "@/lib/ai-tag";
import { Container, PageHeader, Locked, Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { AiTag } from "@/components/AiTag";
import { fa, coins } from "@/lib/persian";
import { getProductBySlug, parseTeaser } from "@/lib/product";
import { salesSummary, userSpentOn, getBuyers, hasHearted, spendableBuyCoins } from "@/lib/market";
import { Gallery } from "./Gallery";
import { PurchasePanel } from "./PurchasePanel";
import { AuctionEnqueue } from "./AuctionEnqueue";

type AuctionInfo =
  | { status: "NONE" }
  | { status: "SCHEDULED"; ahead: number }
  | { status: "LIVE" }
  | { status: "ENDED"; winnerNickname: string | null; finalPrice: number | null };

/** وضعیت حراج نسخهٔ ویژهٔ این محصول (در صف / زنده / تمام‌شده) و تعداد حراج‌های جلوتر در صف. */
async function auctionInfo(productId: string): Promise<AuctionInfo> {
  const auction = await prisma.auction.findUnique({
    where: { productId },
    select: { status: true, order: true, winnerId: true, finalPrice: true },
  });
  if (!auction) return { status: "NONE" };
  if (auction.status === "LIVE") return { status: "LIVE" };
  if (auction.status === "ENDED") {
    const winner = auction.winnerId
      ? await prisma.user.findUnique({ where: { id: auction.winnerId }, select: { nickname: true } })
      : null;
    return { status: "ENDED", winnerNickname: winner?.nickname ?? null, finalPrice: auction.finalPrice };
  }
  const ahead = await prisma.auction.count({ where: { status: { in: ["SCHEDULED", "LIVE"] }, order: { lt: auction.order } } });
  return { status: "SCHEDULED", ahead };
}

/** آیا صف حراج به‌خاطر دقایق پایانی روز بازار بسته است (همان قاعدهٔ enqueueAuction) */
function enqueueCutoffPassed(endsAt: Date | null, cutoffMin: number): boolean {
  return !!endsAt && endsAt.getTime() - Date.now() < cutoffMin * 60_000;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  // نام محصول ثبت‌نهایی‌نشده (پیش‌نویس) نباید از طریق <title> نشت کند.
  return { title: product?.submittedAt ? product.name : "محصول" };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const product = await getProductBySlug(slug);
  // پیش‌نویس محصول (هنوز ثبت نهایی نشده) فقط برای اعضای همان تیم قابل مشاهده است.
  if (!product || (!product.submittedAt && user.teamId !== product.teamId)) notFound();

  const { phase, endsAt } = await getPhase();
  if (phaseIndex(phase) < phaseIndex("BUILD")) {
    return (
      <>
        <PageHeader eyebrow="فاز فعلی" title="بازار" />
        <Container>
          <Locked title="بازار هنوز باز نشده" desc="صفحهٔ محصول از فاز «ساخت محصول» قابل مشاهده می‌شود." />
        </Container>
      </>
    );
  }

  const [summary, buyers, alreadyHearted, alreadySpent, walletBalance, live, auction, cutoffMin] = await Promise.all([
    salesSummary(product.id),
    getBuyers(product.id),
    hasHearted(user.id, product.id),
    userSpentOn(user.id, product.id),
    spendableBuyCoins(user.id, user.buyWallet),
    prisma.product.findUnique({ where: { id: product.id }, select: { liveStatus: true, liveUrl: true } }),
    auctionInfo(product.id),
    getSettingInt("auction_enqueue_cutoff_min", DEFAULTS.auctionEnqueueCutoffMin),
  ]);

  const isOwnTeam = user.teamId === product.teamId;
  const teaser = parseTeaser(product.teaserUrl);
  const hasPurchasedAny = buyers.some((b) => b.userId === user.id);
  const aiTag = productAiTag(product);
  const isLive = live?.liveStatus === "LIVE";
  const liveUrl = isLive && live && /^https?:\/\//i.test(live.liveUrl) ? live.liveUrl : null;
  const hasDemo = !!product.demoUrl && /^https?:\/\//i.test(product.demoUrl);
  const isMarket = phase === "MARKET";
  const specialName = product.specialName || product.name;
  // کارت حراج: برای همه وقتی نسخهٔ ویژه تعریف شده یا حراجی ثبت شده؛ برای اعضای تیم در روز بازار همیشه.
  const showAuctionCard = !!product.specialName || auction.status !== "NONE" || (isOwnTeam && isMarket);

  return (
    <>
      <PageHeader eyebrow={product.teamName} title={product.name} desc={product.tagline} />
      <Container className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          <Gallery images={product.images} seed={product.teamSlug} />

          <div className="card p-4 sm:p-6 space-y-4 anim-rise">
            {isLive && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip-ok">🚀 لایو</span>
                <span className="text-xs text-brand-slate">این محصول روی بازار استودیو منتشر شده است.</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex -space-x-2 space-x-reverse">
                {product.members.map((m) => (
                  <Avatar key={m.id} seed={m.avatarSeed || m.id} size={36} className="ring-2 ring-white" />
                ))}
              </div>
              <div>
                <div className="text-sm font-black text-brand-navy">{product.teamName}</div>
                <div className="text-xs text-brand-slate">{fa(product.members.length)} عضو</div>
              </div>
            </div>

            {product.description && (
              <p className="text-brand-navy leading-7 whitespace-pre-line break-words">{product.description}</p>
            )}

            {teaser.kind !== "none" && teaser.embedSrc && (
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-brand-mist bg-black">
                {teaser.kind === "video" ? (
                  <video src={teaser.embedSrc} controls className="w-full h-full object-contain" />
                ) : (
                  <iframe src={teaser.embedSrc} className="w-full h-full" allowFullScreen title="تیزر محصول" />
                )}
              </div>
            )}

            {(liveUrl || hasDemo) && (
              <div className="flex flex-wrap gap-2">
                {liveUrl && (
                  <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="btn-cyan inline-flex">
                    🚀 نسخهٔ لایو ↗
                  </a>
                )}
                {hasDemo && (
                  <a href={product.demoUrl} target="_blank" rel="noopener noreferrer" className="btn-navy inline-flex">
                    مشاهدهٔ دمو ↗
                  </a>
                )}
              </div>
            )}

            {aiTag && (
              <div className="rounded-2xl bg-brand-ice px-4 py-3 space-y-1">
                <div className="text-xs font-bold text-brand-slate">ارزیابی هوش مصنوعی</div>
                <AiTag tag={aiTag} />
                <p className="text-[11px] text-brand-slate">این برچسب فقط راهنماست؛ داوری انسانی جداگانه انجام می‌شود.</p>
              </div>
            )}
          </div>

          {buyers.length > 0 && (
            <div className="card p-4 sm:p-6 space-y-3 anim-rise">
              <div className="text-sm font-black text-brand-navy">خریداران ({fa(summary.buyersCount)})</div>
              <div className="flex flex-wrap gap-2">
                {buyers.map((b) => (
                  <div key={b.userId} title={`${b.nickname} — ${fa(b.amount)} سکه`} className="flex items-center gap-1.5 rounded-pill bg-brand-ice px-2 py-1">
                    <Avatar seed={b.avatarSeed || b.userId} size={24} />
                    <span className="text-xs font-bold text-brand-navy">{b.nickname}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6 lg:sticky lg:top-20">
          <PurchasePanel
            productId={product.id}
            slug={product.teamSlug}
            price={product.price}
            phaseIsMarket={isMarket}
            isOwnTeam={isOwnTeam}
            alreadySpent={alreadySpent}
            walletBalance={walletBalance}
            hasPurchasedAny={hasPurchasedAny}
            alreadyHearted={alreadyHearted}
            heartsCount={summary.heartsCount}
            soldCount={summary.sold}
          />

          {showAuctionCard && (
            <div className="card p-4 sm:p-6 space-y-3 anim-rise bg-brand-ice">
              <div className="text-xs font-bold text-brand-cyan-dark">نسخهٔ ویژه · حراج زنده</div>
              <div className="font-black text-brand-navy break-words">{specialName}</div>
              {product.specialDesc && <p className="text-sm text-brand-slate leading-6 break-words">{product.specialDesc}</p>}
              <div className="text-sm font-bold text-brand-navy">شروع از {coins(Math.max(1, product.specialStart))}</div>

              {auction.status === "LIVE" ? (
                <>
                  <span className="chip-red">🔴 همین حالا در حراج زنده</span>
                  <Link href="/auction" className="btn-cyan w-full justify-center">
                    رفتن به حراج زنده
                  </Link>
                </>
              ) : auction.status === "SCHEDULED" ? (
                <>
                  <span className="chip-gold">
                    در صف حراج · {auction.ahead === 0 ? "نوبت بعدی" : `${fa(auction.ahead)} حراج جلوتر`}
                  </span>
                  <Link href="/auction" className="btn-ghost w-full justify-center">
                    دیدن صف حراج
                  </Link>
                </>
              ) : auction.status === "ENDED" ? (
                <span className="chip-navy">
                  {auction.winnerNickname
                    ? `حراج شد: ${auction.winnerNickname} با ${coins(auction.finalPrice ?? 0)}`
                    : "حراج بدون برنده تمام شد"}
                </span>
              ) : isOwnTeam && isMarket ? (
                !product.submittedAt ? (
                  <Alert kind="info">برای فرستادن به حراج، اول محصولت را ثبت نهایی کن.</Alert>
                ) : enqueueCutoffPassed(endsAt, cutoffMin) ? (
                  <Alert kind="info">صف حراج در {fa(cutoffMin)} دقیقهٔ پایانی روز بازار بسته است.</Alert>
                ) : (
                  <AuctionEnqueue slug={product.teamSlug} cutoffMin={cutoffMin} />
                )
              ) : isOwnTeam && phaseIndex(phase) < phaseIndex("MARKET") ? (
                <p className="text-xs text-brand-slate leading-6">
                  در «روز بازار» می‌توانی همین‌جا نسخهٔ ویژه را به صف حراج زنده بفرستی.
                </p>
              ) : isMarket ? (
                <p className="text-xs text-brand-slate leading-6">تیم هنوز نسخهٔ ویژه‌اش را به صف حراج نفرستاده است.</p>
              ) : null}
            </div>
          )}
        </div>
      </Container>
    </>
  );
}
