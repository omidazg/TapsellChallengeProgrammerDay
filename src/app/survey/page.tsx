import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container } from "@/components/ui";
import { SurveyForm } from "./SurveyForm";

export const metadata = { title: "نظرسنجی پایان بازی" };

export default async function SurveyPage() {
  const user = await requireUser();
  const existing = await prisma.surveyResponse.findUnique({ where: { userId: user.id } });

  return (
    <>
      <PageHeader
        eyebrow="نظرسنجی"
        title="نظرسنجی پایان بازی"
        desc="چند سؤال کوتاه دربارهٔ تجربه‌ات از میدان بنیان‌گذاران. هر وقت خواستی می‌توانی پاسخت را ویرایش کنی."
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
