import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getPhase, getSettingInt } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { Container, PageHeader } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { fa, coins } from "@/lib/persian";
import { getProductBySlug, parseTeaser } from "@/lib/product";
import { salesSummary, userSpentOn, getBuyers, hasHearted } from "@/lib/market";
import { Gallery } from "./Gallery";
import { PurchasePanel } from "./PurchasePanel";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return { title: product?.name ?? "محصول" };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const { phase } = await getPhase();
  const [summary, buyers, alreadyHearted, alreadySpent, maxPerTarget] = await Promise.all([
    salesSummary(product.id),
    getBuyers(product.id),
    hasHearted(user.id, product.id),
    userSpentOn(user.id, product.id),
    getSettingInt("max_per_target", DEFAULTS.maxPerTarget),
  ]);

  const isOwnTeam = user.teamId === product.teamId;
  const teaser = parseTeaser(product.teaserUrl);
  const hasPurchasedAny = buyers.some((b) => b.userId === user.id);
  const canUsePower = user.power === "BARGAIN" && !user.powerUsed;

  return (
    <>
      <PageHeader eyebrow={product.teamName} title={product.name} desc={product.tagline} />
      <Container className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          <Gallery images={product.images} seed={product.teamSlug} />

          <div className="card p-5 space-y-4 anim-rise">
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
              <p className="text-brand-navy leading-7 whitespace-pre-line">{product.description}</p>
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

            {product.demoUrl && (
              <a href={product.demoUrl} target="_blank" rel="noopener noreferrer" className="btn-navy inline-flex">
                مشاهدهٔ دمو ↗
              </a>
            )}
          </div>

          {buyers.length > 0 && (
            <div className="card p-5 space-y-3 anim-rise">
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
            phaseIsMarket={phase === "MARKET"}
            isOwnTeam={isOwnTeam}
            canUsePower={canUsePower}
            alreadySpent={alreadySpent}
            maxPerTarget={maxPerTarget}
            hasPurchasedAny={hasPurchasedAny}
            alreadyHearted={alreadyHearted}
            heartsCount={summary.heartsCount}
            soldCount={summary.sold}
          />

          {product.specialName && (
            <div className="card p-5 space-y-2 anim-rise bg-brand-ice">
              <div className="text-xs font-bold text-brand-cyan-dark">نسخهٔ ویژه</div>
              <div className="font-black text-brand-navy">{product.specialName}</div>
              {product.specialDesc && <p className="text-sm text-brand-slate leading-6">{product.specialDesc}</p>}
              <div className="flex items-center justify-between pt-1">
                <span className="chip-gold">در حراج زنده</span>
                <span className="text-sm font-bold text-brand-navy">شروع از {coins(product.specialStart)}</span>
              </div>
              <Link href="/auction" className="btn-cyan w-full justify-center">
                رفتن به حراج زنده
              </Link>
            </div>
          )}
        </div>
      </Container>
    </>
  );
}
