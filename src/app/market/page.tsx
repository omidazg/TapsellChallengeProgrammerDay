import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { getPhase, getSettingInt, phaseIndex } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { PageHeader, Container, Empty, Locked, Coin } from "@/components/ui";
import { UnspentReminder } from "@/components/UnspentReminder";
import { fa, coins } from "@/lib/persian";
import { getMarketProducts, getCurrentAdSlotWinners, type MarketSort } from "@/lib/market";
import { SalesTicker } from "./SalesTicker";

export const metadata = { title: "بازار" };

const SORTS: { key: MarketSort; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "top", label: "پرفروش" },
  { key: "popular", label: "محبوب" },
  { key: "cheap", label: "ارزان" },
];

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const user = await requireUser();
  const { phase, endsAt } = await getPhase();
  const sp = await searchParams;

  if (phaseIndex(phase) < phaseIndex("BUILD")) {
    return (
      <>
        <PageHeader eyebrow="فاز فعلی" title="بازار" desc="از تیم‌های دیگر بخر، قلب بده و محصول ویژه‌شان را ببین." />
        <Container>
          <Locked title="بازار هنوز باز نشده" desc="بازار از فاز «ساخت محصول» به‌صورت پیش‌نمایش، و از فاز «روز بازار» برای خرید باز می‌شود." />
        </Container>
      </>
    );
  }

  const browsingOnly = phase === "BUILD";
  const closed = phaseIndex(phase) > phaseIndex("MARKET");
  const readOnly = browsingOnly || closed;
  const sort = (SORTS.find((s) => s.key === sp.sort)?.key ?? "all") as MarketSort;
  const maxPerTarget = await getSettingInt("max_per_target", DEFAULTS.maxPerTarget);
  const [products, adWinners] = await Promise.all([
    getMarketProducts(sort, { userId: user.id, maxPerTarget }),
    readOnly ? Promise.resolve([]) : getCurrentAdSlotWinners(),
  ]);

  const banner = adWinners.find((w) => w.kind === "BANNER");
  const featured = adWinners.find((w) => w.kind === "FEATURED");
  const ordered = featured
    ? [...products].sort((a, b) => Number(b.teamId === featured.teamId) - Number(a.teamId === featured.teamId))
    : products;

  return (
    <>
      <PageHeader
        eyebrow="فاز فعلی"
        title="بازار"
        desc={browsingOnly ? "پیش‌نمایش محصولات؛ خرید از فاز «روز بازار» باز می‌شود." : closed ? "روز بازار تمام شد؛ محصولات فقط برای تماشا باز هستند." : "با کیف خریدت از تیم‌های دیگر بخر و قلب بده."}
      />
      <Container className="space-y-6">
        {banner && (
          <Link href={`/market/${banner.productSlug}`} className="card relative overflow-hidden flex items-center gap-4 p-4 sm:p-6 anim-rise hover:shadow-lift transition">
            <div className="relative size-16 sm:size-20 rounded-2xl overflow-hidden shrink-0">
              <Image src={banner.cover} alt={banner.productName} fill sizes="80px" className="object-cover" unoptimized />
            </div>
            <div className="flex-1 min-w-0">
              <span className="chip-gold mb-1">تبلیغ</span>
              <div className="font-black text-brand-navy truncate">{banner.productName}</div>
              <div className="text-xs text-brand-slate truncate">{banner.teamName}</div>
            </div>
          </Link>
        )}

        {!readOnly && <SalesTicker buyWallet={user.buyWallet} />}

        {phase === "MARKET" && (
          <UnspentReminder
            phase={phase}
            phaseLabel="فاز «روز بازار»"
            endsAt={endsAt ? endsAt.toISOString() : null}
            coinsLeft={user.buyWallet}
            penaltyPerCoin={DEFAULTS.penaltyPerCoin}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {SORTS.map((s) => (
              <Link
                key={s.key}
                href={s.key === "all" ? "/market" : `/market?sort=${s.key}`}
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

        {ordered.length === 0 ? (
          <Empty title="هنوز محصولی ثبت نشده" desc="به‌محض ثبت نهایی محصولات تیم‌ها، اینجا نمایش داده می‌شوند." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
            {ordered.map((p) => {
              const isFeatured = featured?.teamId === p.teamId;
              const isOwnTeam = user.teamId === p.teamId;
              return (
                <Link
                  key={p.id}
                  href={`/market/${p.slug}`}
                  aria-label={`${p.name} از تیم ${p.teamName}، قیمت ${coins(p.price)}`}
                  className="card overflow-hidden anim-rise hover:shadow-lift transition group"
                >
                  <div className="relative aspect-[8/5]">
                    <Image src={p.cover} alt={p.name} fill sizes="400px" className="object-cover group-hover:scale-[1.03] transition" unoptimized />
                    {isFeatured && <span className="chip-gold absolute top-2 right-2">ویژه</span>}
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-brand-slate">
                      <span className="font-bold text-brand-navy">{p.teamName}</span>
                    </div>
                    <div className="font-black text-brand-navy truncate">{p.name}</div>
                    {p.tagline && <p className="text-xs text-brand-slate line-clamp-2">{p.tagline}</p>}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <Coin n={p.price} label="سکه" />
                      <div className="flex items-center gap-2 text-xs text-brand-slate">
                        <span>🛒 {fa(p.sold)}</span>
                        <span>❤️ {fa(p.hearts)}</span>
                      </div>
                    </div>
                    {browsingOnly ? (
                      <span className="chip-cyan w-full justify-center mt-1">به‌زودی</span>
                    ) : closed ? (
                      <span className="chip-navy w-full justify-center mt-1">بازار بسته شد</span>
                    ) : isOwnTeam ? (
                      <span className="chip-navy w-full justify-center mt-1">تیم خودت</span>
                    ) : p.limitReached ? (
                      <span className="chip-red w-full justify-center mt-1">به سقف خریدت از این محصول رسیده‌ای</span>
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
