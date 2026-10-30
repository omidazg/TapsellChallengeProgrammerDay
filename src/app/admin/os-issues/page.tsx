import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty } from "@/components/ui";
import { OsIssueForm } from "./OsIssueForm";

export const metadata = { title: "ایشوهای OS · پنل برگزارکننده" };

export default async function AdminOsIssuesPage() {
  await requireAdmin();
  const issues = await prisma.osIssue.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="ایشوهای OS"
        desc="فهرست ایشوهای محور «راهکار OS». تیم یکی را انتخاب می‌کند و لینک PR یا MR تحویل می‌دهد؛ چند تیم می‌توانند یک ایشو را بردارند. اگر فهرستی نباشد تیم مسئله را خودش تعریف می‌کند."
      />
      <Container className="space-y-4">
        {issues.length === 0 ? (
          <Empty title="هنوز ایشویی ثبت نشده" />
        ) : (
          issues.map((i) => (
            <OsIssueForm
              key={i.id}
              issue={{ id: i.id, title: i.title, description: i.description, url: i.url, active: i.active, productCount: i._count.products }}
            />
          ))
        )}
        <section className="space-y-3 pt-4" aria-labelledby="new-issue-title">
          <h2 id="new-issue-title" className="text-lg font-black text-brand-navy">افزودن ایشو</h2>
          <OsIssueForm />
        </section>
      </Container>
    </>
  );
}
