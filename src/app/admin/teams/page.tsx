import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty } from "@/components/ui";
import { TeamRow } from "./TeamRow";
import { TeamTools } from "./TeamTools";

export const metadata = { title: "تیم‌ها · پنل برگزارکننده" };

export default async function AdminTeamsPage() {
  await requireAdmin();
  const [teams, teamlessUsers] = await Promise.all([
    prisma.team.findMany({
      include: {
        members: { select: { id: true, nickname: true, avatarSeed: true, role: true }, orderBy: { createdAt: "asc" } },
        idea: { select: { submittedAt: true } },
        product: { select: { submittedAt: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { teamId: null },
      select: { id: true, nickname: true, email: true, role: true, avatarSeed: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const allTeams = teams.map((t) => ({ id: t.id, name: t.name }));

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="تیم‌ها" desc="اعضا، وضعیت ایده و محصول، و خزانهٔ هر تیم." />
      <Container className="space-y-6">
        <TeamTools teams={allTeams} teamlessUsers={teamlessUsers} />

        <div className="space-y-4">
          {teams.length === 0 ? (
            <Empty title="هنوز تیمی ساخته نشده" />
          ) : (
            teams.map((t) => (
              <TeamRow
                key={t.id}
                allTeams={allTeams}
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
        </div>
      </Container>
    </>
  );
}
