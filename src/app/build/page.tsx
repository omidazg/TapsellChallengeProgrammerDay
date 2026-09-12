import { requireUser } from "@/lib/auth";
import { getPhase, phaseIndex } from "@/lib/phase";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty, Locked } from "@/components/ui";
import { buildChecklist, parseImages } from "@/lib/product";
import { BuildForm } from "./BuildForm";
import { ChecklistCard } from "./ChecklistCard";

export const metadata = { title: "مرکز ساخت" };

export default async function BuildPage() {
  const user = await requireUser();
  const { phase } = await getPhase();

  if (!user.teamId || !user.team) {
    return (
      <>
        <PageHeader eyebrow="فاز فعلی" title="مرکز ساخت" desc="اینجا محصول تیمت را می‌سازی: توضیح، تیزر، تصاویر، قیمت و نسخهٔ ویژه." />
        <Container>
          <Empty title="هنوز عضو تیمی نیستی" desc="برای ساخت محصول، ابتدا باید عضو یک تیم سه‌نفره شوی." cta={{ href: "/team", label: "رفتن به اتاق تیم" }} />
        </Container>
      </>
    );
  }

  if (phaseIndex(phase) < phaseIndex("IDEATION")) {
    return (
      <>
        <PageHeader eyebrow="فاز فعلی" title="مرکز ساخت" />
        <Container>
          <Locked title="هنوز زود است" desc="مرکز ساخت از فاز «اتاق ایده» باز می‌شود." />
        </Container>
      </>
    );
  }

  const product = await prisma.product.findUnique({ where: { teamId: user.teamId } });
  const editable = phaseIndex(phase) < phaseIndex("MARKET");

  const checklistInput = {
    name: product?.name ?? "",
    tagline: product?.tagline ?? "",
    description: product?.description ?? "",
    demoUrl: product?.demoUrl ?? "",
    teaserUrl: product?.teaserUrl ?? "",
    images: product?.images ?? "[]",
    price: product?.price ?? 20,
    specialName: product?.specialName ?? "",
    submittedAt: product?.submittedAt ?? null,
  };
  const checklist = buildChecklist(checklistInput);

  return (
    <>
      <PageHeader
        eyebrow="فاز فعلی"
        title="مرکز ساخت"
        desc={editable ? "محصولت را کامل کن و پیش از پایان فاز ساخت، ثبت نهایی کن." : "مرکز ساخت قفل شده است؛ فقط می‌توانی پیش‌نمایش را ببینی."}
      />
      <Container className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
        <ChecklistCard
          checklist={checklist}
          submitted={!!product?.submittedAt}
          slug={user.team.slug}
          editable={editable}
          aiQuality={product?.aiQuality ?? null}
          aiNotes={product?.aiNotes ?? null}
        />
        <BuildForm
          editable={editable}
          submitted={!!product?.submittedAt}
          initial={
            product
              ? {
                  name: product.name,
                  tagline: product.tagline,
                  description: product.description,
                  demoUrl: product.demoUrl,
                  teaserUrl: product.teaserUrl,
                  images: parseImages(product.images),
                  price: product.price,
                  specialName: product.specialName,
                  specialDesc: product.specialDesc,
                  specialStart: product.specialStart,
                }
              : null
          }
        />
      </Container>
    </>
  );
}
