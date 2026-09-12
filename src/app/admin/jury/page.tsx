import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty } from "@/components/ui";
import { fa } from "@/lib/persian";
import { JuryScoreForm } from "./JuryScoreForm";

export const metadata = { title: "هیئت داوران · پنل برگزارکننده" };

export default async function AdminJuryPage() {
  await requireAdmin();
  const products = await prisma.product.findMany({
    where: { submittedAt: { not: null } },
    include: { team: { select: { name: true } } },
    orderBy: { submittedAt: "asc" },
  });

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="هیئت داوران" desc="نمرهٔ کیفیت و تیزر را برای محصولات ثبت‌شده وارد کن." />
      <Container className="space-y-4">
        {products.length === 0 ? (
          <Empty title="هنوز محصولی ثبت نشده" />
        ) : (
          products.map((p) => (
            <div key={p.id} className="card p-5 space-y-3 anim-rise">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-black text-brand-navy">{p.name} <span className="text-xs text-brand-slate font-normal">— {p.team.name}</span></div>
                  <div className="text-sm text-brand-slate">{p.tagline}</div>
                </div>
                {p.aiQuality !== null && (
                  <span className="chip-navy">پیش‌نمرهٔ هوش مصنوعی: {fa(p.aiQuality)}</span>
                )}
              </div>
              {p.aiNotes && <p className="text-sm text-brand-slate bg-brand-ice rounded-2xl p-3">{p.aiNotes}</p>}
              <JuryScoreForm productId={p.id} juryQuality={p.juryQuality} juryTeaser={p.juryTeaser} />
            </div>
          ))
        )}
      </Container>
    </>
  );
}
