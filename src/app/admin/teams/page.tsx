import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty } from "@/components/ui";
import { TeamRow } from "./TeamRow";

export const metadata = { title: "تیم‌ها · پنل برگزارکننده" };

export default async function AdminTeamsPage() {
  await requireAdmin();
  const teams = await prisma.team.findMany({
    include: {
      members: { select: { id: true, nickname: true, avatarSeed: true, role: true }, orderBy: { createdAt: "asc" } },
      idea: { select: { submittedAt: true } },
      product: { select: { submittedAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="تیم‌ها" desc="اعضا، وضعیت ایده و محصول، و خزانهٔ هر تیم." />
      <Container className="space-y-4">
        {teams.length === 0 ? (
          <Empty title="هنوز تیمی ساخته نشده" />
        ) : (
          teams.map((t) => (
            <TeamRow
              key={t.id}
              team={{
                id: t.id,
                name: t.name,
                slug: t.slug,
                logoSeed: t.logoSeed,
                treasury: t.treasury,
                members: t.members,
                ideaSubmitted: !!t.idea?.submittedAt,
                productSubmitted: !!t.product?.submittedAt,
              }}
            />
          ))
        )}
      </Container>
    </>
  );
}
