import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listPrizes } from "@/lib/scoring";
import { listAllTracks } from "@/lib/track-data";
import { PageHeader, Container, Alert, Empty } from "@/components/ui";
import { PrizeForm } from "./PrizeForm";

export const metadata = { title: "جوایز · پنل برگزارکننده" };

export default async function AdminPrizesPage() {
  await requireAdmin();
  const [prizes, tracks, products] = await Promise.all([
    listPrizes(),
    listAllTracks(),
    prisma.product.findMany({
      where: { submittedAt: { not: null } },
      select: { id: true, name: true, trackId: true, team: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const trackOptions = tracks.map((t) => ({ id: t.id, name: t.name, mixed: t.category === "MIXED" }));
  const productOptions = products.map((p) => ({ id: p.id, label: `${p.name} — ${p.team.name}`, trackId: p.trackId }));

  // هر ثبت حداکثر یک جایزهٔ ویژه می‌برد؛ جایزهٔ دوم به همان محصول اهدا نمی‌شود.
  const specialCount = new Map<string, number>();
  for (const p of prizes) {
    if (p.kind === "SPECIAL" && p.winnerProductId) specialCount.set(p.winnerProductId, (specialCount.get(p.winnerProductId) ?? 0) + 1);
  }
  const repeated = [...specialCount.values()].some((n) => n > 1);

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="جوایز"
        desc="مبلغ هر جایزه ثابت است و از اول به شرکت‌کننده‌ها نشان داده می‌شود. جایزهٔ رتبه خودکار از جدول محور می‌آید؛ برندهٔ جایزهٔ ویژه را اینجا انتخاب کن."
      />
      <Container className="space-y-4">
        {repeated && (
          <Alert kind="error">
            یک محصول برندهٔ چند جایزهٔ ویژه انتخاب شده است؛ هر ثبت حداکثر یک جایزهٔ ویژه می‌برد و بقیه اهدا نمی‌شوند.
          </Alert>
        )}
        {prizes.length === 0 ? <Empty title="هنوز جایزه‌ای تعریف نشده" /> : prizes.map((p) => <PrizeForm key={p.id} prize={p} tracks={trackOptions} products={productOptions} />)}

        <section className="space-y-3 pt-4" aria-labelledby="new-prize-title">
          <h2 id="new-prize-title" className="text-lg font-black text-brand-navy">افزودن جایزه</h2>
          <PrizeForm tracks={trackOptions} products={productOptions} />
        </section>
      </Container>
    </>
  );
}
