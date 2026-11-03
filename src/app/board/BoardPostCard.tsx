import Link from "next/link";
import Image from "next/image";
import { BOARD_KIND_LABEL } from "@/lib/community";
import type { BoardPostView } from "@/lib/board";
import { isLocalUploadUrl } from "@/lib/product-utils";
import { jdatetime } from "@/lib/persian";
import { Avatar } from "@/components/Avatar";

/** کارت یک پست بورد خبر. full: صفحهٔ اختصاصی پست (بدون پیوند «مشاهده») */
export function BoardPostCard({ post, full = false, hideProduct = false }: { post: BoardPostView; full?: boolean; hideProduct?: boolean }) {
  const kind = BOARD_KIND_LABEL[post.kind];
  return (
    <article className={`card p-4 sm:p-5 space-y-3 anim-rise ${post.featured ? "ring-2 ring-amber-300" : ""}`}>
      <header className="flex flex-wrap items-center gap-2">
        <Avatar seed={post.authorSeed} size={32} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-brand-navy break-words">{post.authorName}</div>
          <div className="text-xs text-brand-slate">
            {post.teamName} · <time dateTime={post.createdAt.toISOString()}>{jdatetime(post.createdAt)}</time>
          </div>
        </div>
        <span className="chip-cyan">
          {kind.emoji} {kind.label}
        </span>
        {post.featured && <span className="chip-gold">🏅 آپدیت هفته</span>}
      </header>
      <p className="text-brand-navy leading-7 whitespace-pre-line break-words">{post.body}</p>
      {post.imageUrl && (
        <div className="relative w-full aspect-[8/5] rounded-2xl overflow-hidden border border-brand-mist bg-brand-ice">
          <Image src={post.imageUrl} alt="" fill sizes="(max-width: 768px) 100vw, 700px" className="object-cover" unoptimized={!isLocalUploadUrl(post.imageUrl)} />
        </div>
      )}
      <footer className="flex flex-wrap items-center gap-2 text-sm">
        {post.product && !hideProduct &&
          (post.product.inShowcase ? (
            <Link href={`/showcase/${post.product.slug}`} className="chip-navy">🛍️ {post.product.name}</Link>
          ) : (
            <span className="chip-navy">🛠️ {post.product.name}</span>
          ))}
        {post.linkUrl && (
          <a href={post.linkUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="chip-navy max-w-full break-all" dir="ltr">
            {post.linkUrl.replace(/^https?:\/\/(www\.)?/i, "").slice(0, 60)} ↗
          </a>
        )}
        {!full && (
          <Link href={`/board/${post.id}`} className="ms-auto text-xs font-bold text-brand-cyan-dark hover:underline">
            مشاهده و اشتراک‌گذاری ←
          </Link>
        )}
      </footer>
    </article>
  );
}
