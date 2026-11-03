import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BOARD_KIND_LABEL, isBoardKind, publicName } from "@/lib/community";
import { PageHeader, Container, Empty } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { moderatePostAction } from "./actions";

export const metadata = { title: "بورد خبر · پنل برگزارکننده" };

function Toggle({ postId, field, value, label, danger = false }: { postId: string; field: "hidden" | "featured"; value: boolean; label: string; danger?: boolean }) {
  return (
    <form action={moderatePostAction}>
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={value ? "1" : "0"} />
      <button type="submit" className={`btn-ghost !py-2 !px-4 text-sm ${danger ? "!text-brand-red" : ""}`}>{label}</button>
    </form>
  );
}

export default async function AdminBoardPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requireAdmin();
  const { filter } = await searchParams;
  const reported = filter === "reported";
  const posts = await prisma.boardPost.findMany({
    where: reported ? { reports: { some: {} } } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      team: { select: { name: true } },
      author: { select: { displayName: true, nickname: true } },
      reports: { select: { reason: true }, orderBy: { createdAt: "desc" } },
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="بورد خبر"
        desc="پست‌های نامناسب را پنهان کن و بهترین پست هفته را «آپدیت هفته» کن؛ تیمش اعلان می‌گیرد و پست بالای بورد می‌آید. به پست‌ها سکه داده نمی‌شود."
        action={<Link href="/board" className="btn-ghost">دیدن بورد</Link>}
      />
      <Container className="space-y-4">
        <div className="flex gap-2">
          <Link href="/admin/board" className={`rounded-pill px-3.5 py-1.5 text-sm font-bold ${!reported ? "bg-brand-navy text-white" : "bg-brand-ice text-brand-navy"}`}>همه (۱۰۰ تای آخر)</Link>
          <Link href="/admin/board?filter=reported" className={`rounded-pill px-3.5 py-1.5 text-sm font-bold ${reported ? "bg-brand-navy text-white" : "bg-brand-ice text-brand-navy"}`}>گزارش‌شده</Link>
        </div>
        {posts.length === 0 ? (
          <Empty title={reported ? "پست گزارش‌شده‌ای نیست" : "هنوز پستی نیامده"} />
        ) : (
          posts.map((p) => {
            const kind = isBoardKind(p.kind) ? BOARD_KIND_LABEL[p.kind] : null;
            return (
              <div key={p.id} className={`card p-4 sm:p-5 space-y-2 ${p.hidden ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-brand-slate">
                  {kind && <span className="chip-cyan">{kind.emoji} {kind.label}</span>}
                  <span className="font-bold text-brand-navy">{p.team.name}</span>
                  <span>{publicName(p.author)}</span>
                  <span>{jdatetime(p.createdAt)}</span>
                  {p.featured && <span className="chip-gold">🏅 آپدیت هفته</span>}
                  {p.hidden && <span className="chip-red">پنهان</span>}
                  {p.reports.length > 0 && <span className="chip-red">🚩 {fa(p.reports.length)} گزارش</span>}
                </div>
                <p className="text-sm text-brand-navy whitespace-pre-line break-words">{p.body}</p>
                {p.reports.some((r) => r.reason) && (
                  <ul className="text-xs text-brand-red list-disc ps-5">
                    {p.reports.filter((r) => r.reason).map((r, i) => <li key={i}>{r.reason}</li>)}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  {!p.hidden && <Link href={`/board/${p.id}`} className="btn-ghost !py-2 !px-4 text-sm">مشاهده</Link>}
                  <Toggle postId={p.id} field="featured" value={!p.featured} label={p.featured ? "برداشتن آپدیت هفته" : "🏅 آپدیت هفته"} />
                  <Toggle postId={p.id} field="hidden" value={!p.hidden} label={p.hidden ? "نمایش دوباره" : "پنهان کردن"} danger={!p.hidden} />
                </div>
              </div>
            );
          })
        )}
      </Container>
    </>
  );
}
