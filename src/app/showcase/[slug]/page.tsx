import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { moduleStatusFor } from "@/lib/module-state";
import { getShowcaseProduct, hasVoted } from "@/lib/showcase";
import { listBoard } from "@/lib/board";
import { parseTeaser, coverUrl } from "@/lib/product-utils";
import { TRACK_KIND_LABEL } from "@/lib/tracks";
import { Gallery } from "@/app/market/[slug]/Gallery";
import { ModuleClosed } from "@/components/ModuleState";
import { Avatar } from "@/components/Avatar";
import { ShareButtons } from "@/components/ShareButtons";
import { Container, PageHeader } from "@/components/ui";
import { BoardPostCard } from "@/app/board/BoardPostCard";
import { VoteButton } from "../VoteButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getShowcaseProduct(slug);
  if (!p) return { title: "ویترین محصولات" };
  const makers = p.makers.map((m) => m.name).join("، ");
  const description = `${p.tagline || p.name}؛ ساختهٔ ${makers} (${p.team.name}) در میدان بنیان‌گذاران`;
  return {
    title: p.name,
    description,
    openGraph: { title: p.name, description, images: [coverUrl(p.images, p.team.slug)] },
  };
}

export default async function ShowcaseProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const status = await moduleStatusFor("showcase", user?.teamId);
  if (status === "hidden") notFound();
  if (status === "closed") return <ModuleClosed moduleKey="showcase" title="ویترین محصولات" />;

  const p = await getShowcaseProduct(slug);
  if (!p) notFound();

  const [voted, board] = await Promise.all([user ? hasVoted(user.id, p.id) : false, listBoard({ productId: p.id })]);
  const own = !!user?.teamId && user.teamId === p.teamId;
  const mode = !user ? "guest" : own ? "own" : status !== "open" ? "closed" : "vote";
  const teaser = parseTeaser(p.teaserUrl);
  const liveUrl = p.liveStatus === "LIVE" && /^https?:\/\//i.test(p.liveUrl) ? p.liveUrl : null;
  const demoUrl = /^https?:\/\//i.test(p.demoUrl) ? p.demoUrl : null;
  const deliverableUrl = /^https?:\/\//i.test(p.deliverableUrl) ? p.deliverableUrl : null;

  return (
    <>
      <PageHeader
        eyebrow={`ویترین محصولات · ${p.track.name}`}
        title={p.name}
        desc={p.tagline}
        action={<VoteButton productId={p.id} slug={p.slug} votes={p.votes} voted={voted} mode={mode} />}
      />
      <Container className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          <Gallery images={p.images} seed={p.team.slug} name={p.name} />
          <div className="card p-4 sm:p-6 space-y-4 anim-rise">
            {p.description && <p className="text-brand-navy leading-7 whitespace-pre-line break-words">{p.description}</p>}
            {(teaser.kind === "youtube" || teaser.kind === "aparat") && teaser.embedSrc && (
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-brand-mist bg-black">
                <iframe src={teaser.embedSrc} className="w-full h-full" allowFullScreen title="تیزر محصول" loading="lazy" />
              </div>
            )}
            {teaser.kind === "video" && teaser.embedSrc && (
              <a href={teaser.embedSrc} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost inline-flex">🎬 تماشای تیزر ↗</a>
            )}
            <div className="flex flex-wrap gap-2">
              {liveUrl && <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="btn-cyan inline-flex">🚀 نسخهٔ لایو ↗</a>}
              {demoUrl && <a href={demoUrl} target="_blank" rel="noopener noreferrer" className="btn-navy inline-flex">مشاهدهٔ محصول ↗</a>}
              {deliverableUrl && (
                <a href={deliverableUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn-navy inline-flex">
                  {p.track.kind === "OS" ? "مشاهدهٔ PR یا MR ↗" : "مشاهدهٔ محتوا ↗"}
                </a>
              )}
            </div>
          </div>

          <section aria-labelledby="updates-title" className="space-y-3">
            <h2 id="updates-title" className="text-lg font-black text-brand-navy">📰 خبرهای این محصول</h2>
            {board.posts.length === 0 ? (
              <p className="text-sm text-brand-slate">تیم هنوز خبری از این محصول در بورد نگذاشته است.</p>
            ) : (
              board.posts.map((post) => <BoardPostCard key={post.id} post={post} hideProduct />)
            )}
          </section>
        </div>

        <div className="space-y-6 lg:sticky lg:top-20">
          <div className="card p-4 sm:p-6 space-y-4 anim-rise">
            <div className="text-xs font-bold text-brand-slate">ساخته‌شده توسط</div>
            <div className="text-sm font-black text-brand-navy">{p.team.name}</div>
            <ul className="space-y-2">
              {p.makers.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <Avatar seed={m.avatarSeed || m.id} size={32} />
                  <span className="text-sm font-bold text-brand-navy">{m.name}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <span className="chip-cyan">{p.track.name}</span>
              {p.track.kind !== "PRODUCT" && <span className="chip-navy">{TRACK_KIND_LABEL[p.track.kind as keyof typeof TRACK_KIND_LABEL]}</span>}
              {p.showcaseFeatured && <span className="chip-gold">⭐ انتخاب کمیته</span>}
            </div>
          </div>
          <div className="card p-4 sm:p-6 space-y-3 anim-rise">
            <div className="text-sm font-black text-brand-navy">به دوستانت معرفی کن</div>
            <ShareButtons path={`/showcase/${p.slug}`} text={`${p.name}: ${p.tagline}`} />
          </div>
          <Link href="/showcase" className="btn-ghost w-full justify-center">بازگشت به ویترین</Link>
        </div>
      </Container>
    </>
  );
}
