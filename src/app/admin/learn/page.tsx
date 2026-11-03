import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty } from "@/components/ui";
import { LessonForm } from "./LessonForm";

export const metadata = { title: "آموزش · پنل برگزارکننده" };

export default async function AdminLearnPage() {
  await requireAdmin();
  const lessons = await prisma.lesson.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  const nextOrder = lessons.length ? Math.max(...lessons.map((l) => l.order)) + 1 : 0;
  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="آموزش"
        desc="درس‌های ویدیویی صفحهٔ آموزش. ویدیو را روی آپارات بگذار و لینکش را اینجا وارد کن تا داخل سایت پخش شود."
        action={<Link href="/learn" className="btn-ghost">دیدن صفحهٔ آموزش</Link>}
      />
      <Container className="space-y-4">
        {lessons.length === 0 ? (
          <Empty title="هنوز درسی ثبت نشده" desc="تا وقتی درسی نباشد، صفحهٔ آموزش «به‌زودی» نشان می‌دهد." />
        ) : (
          lessons.map((l) => (
            <LessonForm
              key={l.id}
              lesson={{ id: l.id, title: l.title, instructor: l.instructor, description: l.description, videoUrl: l.videoUrl, links: l.links, order: l.order, published: l.published }}
            />
          ))
        )}
        <section className="space-y-3 pt-4" aria-labelledby="new-lesson-title">
          <h2 id="new-lesson-title" className="text-lg font-black text-brand-navy">افزودن درس</h2>
          <LessonForm nextOrder={nextOrder} />
        </section>
      </Container>
    </>
  );
}
