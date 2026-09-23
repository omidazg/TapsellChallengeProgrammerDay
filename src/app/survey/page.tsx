import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase } from "@/lib/phase";
import { PageHeader, Container, Locked } from "@/components/ui";
import { SurveyForm } from "./SurveyForm";

export const metadata = { title: "نظرسنجی پایان بازی" };

export default async function SurveyPage() {
  const user = await requireUser();
  const { phase } = await getPhase();
  const open = phase === "AUCTION" || phase === "CLOSED";

  if (!open) {
    return (
      <>
        <PageHeader eyebrow="نظرسنجی" title="نظرسنجی پایان بازی" />
        <Container>
          <Locked title="هنوز زود است" desc="نظرسنجی از فاز «حراج زنده» باز می‌شود." />
        </Container>
      </>
    );
  }

  const existing = await prisma.surveyResponse.findUnique({ where: { userId: user.id } });

  return (
    <>
      <PageHeader
        eyebrow="نظرسنجی"
        title="نظرسنجی پایان بازی"
        desc="چند سؤال کوتاه دربارهٔ تجربه‌ات از میدان بنیان‌گذاران. تا پایان بازی می‌توانی پاسخت را ویرایش کنی."
      />
      <Container>
        <div className="max-w-xl">
          <SurveyForm
            initial={existing ? { rating: existing.rating, fun: existing.fun, learned: existing.learned, comment: existing.comment } : null}
          />
        </div>
      </Container>
    </>
  );
}
