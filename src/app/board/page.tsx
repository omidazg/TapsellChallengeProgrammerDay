import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moduleStatusFor } from "@/lib/module-state";
import { listBoard } from "@/lib/board";
import { ModuleClosed, ModuleReadOnly } from "@/components/ModuleState";
import { PageHeader, Container, Empty } from "@/components/ui";
import { fa } from "@/lib/persian";
import { BoardPostCard } from "./BoardPostCard";
import { BoardComposer } from "./BoardComposer";

export const metadata = {
  title: "بورد خبر",
  description: "تیم‌های میدان بنیان‌گذاران از پیشرفت، لانچ و درس‌هایشان می‌نویسند.",
};
export const dynamic = "force-dynamic";

const TITLE = "بورد خبر";

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const status = await moduleStatusFor("board", user?.teamId);
  if (status === "hidden") notFound();
  if (status === "closed") return <ModuleClosed moduleKey="board" title={TITLE} />;

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [{ posts, featured, pages }, products] = await Promise.all([
    listBoard({ page }),
    user?.teamId && status === "open"
      ? prisma.product.findMany({ where: { teamId: user.teamId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } })
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="ساختن در جمع"
        title={TITLE}
        desc="تیم‌ها اینجا از پیشرفت، لانچ، درس‌آموخته‌ها و بازخوردی که لازم دارند می‌نویسند. بهترین پست هر هفته «آپدیت هفته» می‌شود."
        action={<Link href="/showcase" className="btn-ghost">🛍️ ویترین محصولات</Link>}
      />
      <Container className="max-w-3xl space-y-6">
        {status === "ro" && <ModuleReadOnly moduleKey="board" />}
        {products ? (
          <BoardComposer products={products} />
        ) : !user ? (
          <p className="text-sm text-brand-slate">
            برای نوشتن در بورد <Link href="/login?next=%2Fboard" className="underline underline-offset-4">وارد شو</Link>.
          </p>
        ) : !user.teamId && status === "open" ? (
          <p className="text-sm text-brand-slate">
            برای نوشتن در بورد اول <Link href="/team" className="underline underline-offset-4">عضو یک تیم شو</Link>.
          </p>
        ) : null}

        {featured.length > 0 && (
          <section aria-labelledby="featured-title" className="space-y-3">
            <h2 id="featured-title" className="text-lg font-black text-brand-navy">🏅 آپدیت‌های هفته</h2>
            {featured.map((p) => (
              <BoardPostCard key={p.id} post={p} />
            ))}
          </section>
        )}

        <section aria-labelledby="latest-title" className="space-y-3">
          <h2 id="latest-title" className="text-lg font-black text-brand-navy">تازه‌ترین‌ها</h2>
          {posts.length === 0 ? (
            <Empty title="هنوز پستی نیامده" desc="اولین تیمی باش که از پیشرفتش می‌نویسد." />
          ) : (
            posts.map((p) => <BoardPostCard key={p.id} post={p} />)
          )}
        </section>

        {pages > 1 && (
          <nav className="flex items-center justify-between gap-2" aria-label="صفحه‌بندی">
            {page > 1 ? <Link href={`/board?page=${page - 1}`} className="btn-ghost">→ تازه‌تر</Link> : <span />}
            <span className="text-sm text-brand-slate fa-num">
              صفحهٔ {fa(page)} از {fa(pages)}
            </span>
            {page < pages ? <Link href={`/board?page=${page + 1}`} className="btn-ghost">قدیمی‌تر ←</Link> : <span />}
          </nav>
        )}
      </Container>
    </>
  );
}
