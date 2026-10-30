import Link from "next/link";
import Image from "next/image";
import { isLocalUploadUrl } from "@/lib/product-utils";
import { thumbUrl } from "@/lib/thumb";
import { requireUser } from "@/lib/auth";
import { moduleStatusFor } from "@/lib/module-state";
import { listVisibleTracks } from "@/lib/track-data";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { productAiTag, type AiTagInfo } from "@/lib/ai-tag";
import { PageHeader, Container, Empty, Coin } from "@/components/ui";
import { ModuleClosed, ModuleReadOnly } from "@/components/ModuleState";
import { TrackSwitcher } from "@/components/TrackSwitcher";
import { AiTag } from "@/components/AiTag";
import { fa, coins } from "@/lib/persian";
import { getMarketProducts, getCurrentAdSlotWinners, MARKET_CACHE_PREFIX, type MarketSort } from "@/lib/market";
import { cached } from "@/lib/ttl-cache";
import { SalesTicker } from "./SalesTicker";

export const metadata = { title: "بازار" };

const SORTS: { key: MarketSort; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "top", label: "پرفروش" },
  { key: "popular", label: "محبوب" },
  { key: "cheap", label: "ارزان" },
];

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ sort?: string; track?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const status = await moduleStatusFor("market", user.teamId);
  if (status === "hidden") notFound();
  if (status === "closed") return <ModuleClosed moduleKey="market" title="بازار" />;

  const readOnly = status !== "open";
  const sort = (SORTS.find((s) => s.key === sp.sort)?.key ?? "all") as MarketSort;
  const [allProducts, adWinners, aiRows, tracks] = await Promise.all([
    getMarketProducts(sort, { userId: user.id }),
    readOnly ? Promise.resolve([]) : getCurrentAdSlotWinners(),
    // برچسب هوش مصنوعی کارت‌ها (نمرهٔ داور هوش مصنوعی) — MarketCard این دو فیلد را ندارد.
    // کش کوتاه مشترک (مثل کارت‌های بازار) تا هر بازدید یک کوئری تازه نسازد.
    cached(`${MARKET_CACHE_PREFIX}ai`, 3_000, () =>
      prisma.product.findMany({ where: { submittedAt: { not: null } }, select: { id: true, aiQuality: true, aiNotes: true, aiFinal: true, aiFinalNotes: true } })
    ),
    listVisibleTracks(),
  ]);
  // نمرهٔ نمایشی: ارزیابی نهایی اگر انجام شده، وگرنه بازخورد اولیه
  const aiTagById = new Map<string, AiTagInfo | null>(
    aiRows.map((r) => [r.id, productAiTag({ aiQuality: r.aiFinal ?? r.aiQuality, aiNotes: r.aiFinalNotes ?? r.aiNotes })])
  );
  const trackId = tracks.find((t) => t.id === sp.track)?.id ?? null;
  const visibleIds = new Set(tracks.map((t) => t.id));
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  const products = allProducts.filter((p) => visibleIds.has(p.trackId) && (!trackId || p.trackId === trackId));
  const hrefFor = (nextTrack: string | null, nextSort: MarketSort = sort) => {
    const q = new URLSearchParams();
    if (nextSort !== "all") q.set("sort", nextSort);
    if (nextTrack) q.set("track", nextTrack);
    const s = q.toString();
    return s ? `/market?${s}` : "/market";
  };

  const banner = adWinners.find((w) => w.kind === "BANNER");
  const featured = adWinners.find((w) => w.kind === "FEATURED");
  const ordered = featured
    ? [...products].sort((a, b) => Number(b.slug === featured.productSlug) - Number(a.slug === featured.productSlug))
    : products;

  return (
    <>
      <PageHeader
        title="بازار"
        desc={readOnly ? "محصولات فعلاً فقط برای تماشا باز هستند." : "با سکه‌هایت از تیم‌های دیگر بخر و قلب بده؛ هر خرید یعنی حمایت از آن تیم."}
      />
      <Container className="space-y-6">
        {status === "ro" && <ModuleReadOnly moduleKey="market" />}
        {banner && (
          <Link href={`/market/${banner.productSlug}`} className="card relative overflow-hidden flex items-center gap-4 p-4 sm:p-6 anim-rise hover:shadow-lift transition">
            <div className="relative size-16 sm:size-20 rounded-2xl overflow-hidden shrink-0">
              <Image src={thumbUrl(banner.cover)} alt={banner.productName} fill sizes="80px" className="object-cover" unoptimized={!isLocalUploadUrl(banner.cover)} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="chip-gold mb-1">تبلیغ</span>
              <div className="font-black text-brand-navy truncate">{banner.productName}</div>
              <div className="text-xs text-brand-slate truncate">{banner.teamName}</div>
            </div>
          </Link>
        )}

        {!readOnly && <SalesTicker buyWallet={user.buyWallet} />}

        <TrackSwitcher tracks={tracks} current={trackId} hrefFor={(id) => hrefFor(id)} allLabel="همهٔ محورها" />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {SORTS.map((s) => (
              <Link
                key={s.key}
                href={hrefFor(trackId, s.key)}
                className={sort === s.key ? "chip bg-brand-navy text-white" : "chip-navy hover:bg-brand-mist"}
              >
                {s.label}
              </Link>
            ))}
          </div>
          <Link href="/guide#market" className="text-xs font-bold text-brand-cyan-dark hover:underline">
            راهنما: چطور بخرم؟
          </Link>
        </div>

        {/* سرتیتر پنهان فهرست؛ ترتیب h1 ← h2 ← h3 (کارت خالی) را درست نگه می‌دارد */}
        <h2 className="sr-only">محصولات بازار</h2>
        {ordered.length === 0 ? (
          <Empty title="هنوز محصولی ثبت نشده" desc="به‌محض ثبت نهایی محصولات تیم‌ها، اینجا نمایش داده می‌شوند." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
            {ordered.map((p) => {
              const isFeatured = featured?.productSlug === p.slug;
              const isOwnTeam = user.teamId === p.teamId;
              return (
                <Link
                  key={p.id}
                  href={`/market/${p.slug}`}
                  aria-label={`${p.name} از تیم ${p.teamName}، قیمت ${coins(p.price)}${p.live ? "، لایو" : ""}${p.bought ? "، قبلاً خریده‌ای" : ""}`}
                  className="card overflow-hidden anim-rise hover:shadow-lift transition group"
                >
                  <div className="relative aspect-[8/5]">
                    <Image src={thumbUrl(p.cover)} alt={p.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px" className="object-cover group-hover:scale-[1.03] transition" unoptimized={!isLocalUploadUrl(p.cover)} />
                    {isFeatured && <span className="chip-gold absolute top-2 right-2">ویژه</span>}
                    {p.live && <span className="chip-ok absolute top-2 left-2">🚀 لایو</span>}
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-brand-slate">
                      <span className="font-bold text-brand-navy">{p.teamName}</span>
                      {!trackId && tracks.length > 1 && <span className="chip-cyan">{trackName.get(p.trackId)}</span>}
                      <AiTag tag={aiTagById.get(p.id) ?? null} compact />
                      {p.bought && <span className="chip-ok">✓ خریدی</span>}
                    </div>
                    <div className="font-black text-brand-navy truncate">{p.name}</div>
                    {p.tagline && <p className="text-xs text-brand-slate line-clamp-2">{p.tagline}</p>}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <Coin n={p.price} label="سکه" />
                      <div className="flex items-center gap-2 text-xs text-brand-slate">
                        <span title="سکهٔ فروش‌رفته">🛒 {fa(p.sold)} سکه</span>
                        <span>❤️ {fa(p.hearts)}</span>
                      </div>
                    </div>
                    {readOnly ? (
                      <span className="chip-navy w-full justify-center mt-1">فقط تماشا</span>
                    ) : isOwnTeam ? (
                      <span className="chip-navy w-full justify-center mt-1">تیم خودت</span>
                    ) : (
                      <span className="chip-navy w-full justify-center mt-1 group-hover:bg-brand-mist transition">مشاهده و خرید ←</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Container>
    </>
  );
}
