import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publicName, showcaseStatusLabel } from "@/lib/showcase";
import { PageHeader, Container, Empty } from "@/components/ui";
import { fa } from "@/lib/persian";
import { featureShowcaseAction, reviewShowcaseAction } from "./actions";

export const metadata = { title: "ویترین محصولات · پنل برگزارکننده" };

const ORDER: Record<string, number> = { REQUESTED: 0, APPROVED: 1, REJECTED: 2 };

export default async function AdminShowcasePage() {
  await requireAdmin();
  const products = await prisma.product.findMany({
    where: { showcaseStatus: { not: "" } },
    select: {
      id: true,
      slug: true,
      name: true,
      tagline: true,
      submittedAt: true,
      showcaseStatus: true,
      showcaseFeatured: true,
      showcaseNote: true,
      track: { select: { name: true } },
      team: { select: { name: true, members: { select: { displayName: true, nickname: true } } } },
      _count: { select: { showcaseVotes: true } },
    },
  });
  products.sort((a, b) => (ORDER[a.showcaseStatus] ?? 9) - (ORDER[b.showcaseStatus] ?? 9) || b._count.showcaseVotes - a._count.showcaseVotes);

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="ویترین محصولات"
        desc="درخواست‌های نمایش در ویترین عمومی. محصول تأییدشده بدون ورود دیده می‌شود و رأی مردمی می‌گیرد؛ رأی‌ها در امتیاز اثری ندارند و برای جایزهٔ ویژهٔ «انتخاب مردمی» هستند. «انتخاب کمیته» بالای ویترین نمایش داده می‌شود."
        action={<Link href="/showcase" className="btn-ghost">دیدن ویترین</Link>}
      />
      <Container className="space-y-4">
        {products.length === 0 ? (
          <Empty title="هنوز درخواستی نیامده" desc="تیم‌ها از مرکز ساخت، بعد از ثبت نهایی محصول، درخواست می‌دهند." />
        ) : (
          products.map((p) => (
            <div key={p.id} className="card p-4 sm:p-6 space-y-3 anim-rise">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black text-brand-navy">{p.name}</span>
                <span className="chip-cyan">{p.track.name}</span>
                <span className={p.showcaseStatus === "APPROVED" ? "chip-ok" : p.showcaseStatus === "REQUESTED" ? "chip-gold" : "chip-red"}>
                  {showcaseStatusLabel(p.showcaseStatus)}
                </span>
                {p.showcaseFeatured && <span className="chip-gold">⭐ انتخاب کمیته</span>}
                <span className="mr-auto text-sm font-bold text-brand-navy">▲ {fa(p._count.showcaseVotes)} رأی</span>
              </div>
              <p className="text-sm text-brand-slate">{p.tagline}</p>
              <p className="text-xs text-brand-slate">
                {p.team.name} · {p.team.members.map(publicName).join("، ")}
                {!p.submittedAt && " · ⚠️ تیم ثبت نهایی را برای ویرایش باز کرده؛ تا ثبت دوباره در ویترین دیده نمی‌شود"}
              </p>
              {p.showcaseStatus === "REJECTED" && p.showcaseNote && <p className="text-xs text-brand-red">یادداشت: {p.showcaseNote}</p>}
              <div className="flex flex-wrap items-end gap-2">
                <Link href={`/market/${p.slug}`} className="btn-ghost !py-2 !px-4 text-sm">صفحهٔ محصول</Link>
                {p.showcaseStatus !== "APPROVED" && (
                  <form action={reviewShowcaseAction}>
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="decision" value="APPROVED" />
                    <button type="submit" className="btn-primary !py-2 !px-4 text-sm">تأیید و انتشار</button>
                  </form>
                )}
                {p.showcaseStatus === "APPROVED" && (
                  <form action={featureShowcaseAction}>
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="featured" value={p.showcaseFeatured ? "0" : "1"} />
                    <button type="submit" className="btn-ghost !py-2 !px-4 text-sm">{p.showcaseFeatured ? "برداشتن از انتخاب کمیته" : "⭐ انتخاب کمیته"}</button>
                  </form>
                )}
                {p.showcaseStatus !== "REJECTED" && (
                  <form action={reviewShowcaseAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="decision" value="REJECTED" />
                    <label className="sr-only" htmlFor={`note-${p.id}`}>دلیل</label>
                    <input id={`note-${p.id}`} name="note" maxLength={500} placeholder="دلیل برای تیم" className="input !py-2 !px-3 w-56" />
                    <button type="submit" className="btn-ghost !py-2 !px-4 text-sm !text-brand-red">
                      {p.showcaseStatus === "APPROVED" ? "برداشتن از ویترین" : "نیاز به اصلاح"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))
        )}
      </Container>
    </>
  );
}
