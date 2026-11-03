import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { moduleStatusFor } from "@/lib/module-state";
import { listVisibleTracks } from "@/lib/track-data";
import { listShowcase, SHOWCASE_SORTS, type ShowcaseCard, type ShowcaseSort } from "@/lib/showcase";
import { isLocalUploadUrl } from "@/lib/product-utils";
import { thumbUrl } from "@/lib/thumb";
import { ModuleClosed } from "@/components/ModuleState";
import { PageHeader, Container, Empty } from "@/components/ui";
import { fa } from "@/lib/persian";

export const metadata = {
  title: "ویترین محصولات",
  description: "محصول‌هایی که بچه‌های گروه پگاه در میدان بنیان‌گذاران ساخته‌اند، با نام سازنده‌ها و رأی مردمی.",
};
export const dynamic = "force-dynamic";

const TITLE = "ویترین محصولات";

function sortHref(sort: ShowcaseSort, track?: string) {
  const q = new URLSearchParams();
  if (sort !== "top") q.set("sort", sort);
  if (track) q.set("track", track);
  const s = q.toString();
  return s ? `/showcase?${s}` : "/showcase";
}

export default async function ShowcasePage({ searchParams }: { searchParams: Promise<{ sort?: string; track?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const status = await moduleStatusFor("showcase", user?.teamId);
  if (status === "hidden") notFound();
  if (status === "closed") return <ModuleClosed moduleKey="showcase" title={TITLE} />;

  const sort: ShowcaseSort = SHOWCASE_SORTS.some((s) => s.key === sp.sort) ? (sp.sort as ShowcaseSort) : "top";
  const tracks = await listVisibleTracks();
  const track = tracks.find((t) => t.id === sp.track)?.id;
  const [cards, all] = await Promise.all([listShowcase({ sort, trackId: track }), track || sort !== "top" ? listShowcase() : null]);
  const featured = (all ?? cards).filter((c) => c.featured);

  return (
    <>
      <PageHeader
        eyebrow="زنده · با رأی بچه‌ها"
        title={TITLE}
        desc="محصول‌هایی که تیم‌های میدان بنیان‌گذاران ساخته‌اند، با نام سازنده‌هایشان. به محصولی که دوست داری رأی بده؛ رأی‌ها در امتیاز مسابقه حساب نمی‌شوند و فقط برای جایزهٔ «انتخاب مردمی» است."
        action={<Link href="/board" className="btn-ghost">📰 بورد خبر</Link>}
      />
      <Container className="space-y-8">
        {featured.length > 0 && (
          <section aria-labelledby="featured-title" className="space-y-3">
            <h2 id="featured-title" className="text-lg font-black text-brand-navy">⭐ انتخاب کمیته</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((c) => (
                <Card key={c.id} card={c} />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="all-title" className="space-y-4">
          <h2 id="all-title" className="sr-only">همهٔ محصولات</h2>
          <div className="flex flex-wrap items-center gap-2">
            {SHOWCASE_SORTS.map((s) => (
              <Link
                key={s.key}
                href={sortHref(s.key, track)}
                aria-current={s.key === sort ? "page" : undefined}
                className={`rounded-pill px-3.5 py-1.5 text-sm font-bold ${s.key === sort ? "bg-brand-navy text-white" : "text-brand-navy bg-brand-ice hover:bg-brand-mist"}`}
              >
                {s.label}
              </Link>
            ))}
            {tracks.length > 1 && (
              <span className="ms-auto flex flex-wrap gap-2">
                <Link href={sortHref(sort)} className={`chip-navy ${!track ? "" : "opacity-60"}`}>همهٔ محورها</Link>
                {tracks.map((t) => (
                  <Link key={t.id} href={sortHref(sort, t.id)} className={`chip-cyan ${track === t.id ? "" : "opacity-60"}`}>
                    {t.name}
                  </Link>
                ))}
              </span>
            )}
          </div>
          {cards.length === 0 ? (
            <Empty title="هنوز محصولی در ویترین نیست" desc="تیم‌ها بعد از ثبت نهایی محصول، از مرکز ساخت درخواست نمایش در ویترین می‌دهند." />
          ) : (
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c, i) => (
                <li key={c.id}>
                  <Card card={c} rank={sort === "new" ? undefined : i + 1} />
                </li>
              ))}
            </ol>
          )}
        </section>
      </Container>
    </>
  );
}

function Card({ card, rank }: { card: ShowcaseCard; rank?: number }) {
  return (
    <Link href={`/showcase/${card.slug}`} className="card overflow-hidden flex flex-col h-full group anim-rise">
      <div className="relative w-full aspect-[8/5] bg-brand-ice">
        <Image src={thumbUrl(card.image)} alt={card.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px" className="object-cover group-hover:scale-[1.03] transition" unoptimized={!isLocalUploadUrl(card.image)} />
        {rank && <span className="absolute top-2 start-2 chip-navy fa-num">#{fa(rank)}</span>}
        {card.isLive && <span className="absolute top-2 end-2 chip-ok">🚀 لایو</span>}
      </div>
      <div className="p-4 flex-1 flex gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-black text-brand-navy break-words">{card.name}</div>
          {card.tagline && <p className="text-sm text-brand-slate line-clamp-2">{card.tagline}</p>}
          <div className="text-xs text-brand-slate">
            <span className="font-bold">{card.teamName}</span> · {card.makers.join("، ")}
          </div>
          <span className="chip-cyan">{card.trackName}</span>
        </div>
        <div className="shrink-0 text-center rounded-2xl border border-brand-mist px-3 py-2 self-start">
          <div aria-hidden className="text-xs text-brand-slate">▲</div>
          <div className="font-black text-brand-navy fa-num">{fa(card.votes)}</div>
          <div className="sr-only">رأی</div>
        </div>
      </div>
    </Link>
  );
}
