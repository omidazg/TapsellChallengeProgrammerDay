import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listAllTracks } from "@/lib/track-data";
import { PageHeader, Container, Empty } from "@/components/ui";
import { TeamRow } from "./TeamRow";
import { TeamTools } from "./TeamTools";

export const metadata = { title: "تیم‌ها · پنل برگزارکننده" };

export default async function AdminTeamsPage() {
  await requireAdmin();
  const [teams, teamlessUsers, tracks] = await Promise.all([
    prisma.team.findMany({
      include: {
        members: { select: { id: true, nickname: true, avatarSeed: true, role: true }, orderBy: { createdAt: "asc" } },
        ideas: { select: { trackId: true, submittedAt: true } },
        products: { select: { trackId: true, submittedAt: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { teamId: null },
      select: { id: true, nickname: true, email: true, role: true, avatarSeed: true },
      orderBy: { createdAt: "asc" },
    }),
    listAllTracks(),
  ]);

  const allTeams = teams.map((t) => ({ id: t.id, name: t.name }));

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="تیم‌ها"
        desc="اعضا (۱ تا ۳ نفر)، وضعیت ایده و محصول در هر محور، و کسر امتیاز تقلب هر تیم."
      />
      <Container className="space-y-6">
        {/* کارت‌های ابزار h3 دارند؛ h2های پنهان ترتیب سرتیترها را درست نگه می‌دارند */}
        <h2 className="sr-only">ابزارهای تیم‌بندی</h2>
        <TeamTools teams={allTeams} teamlessUsers={teamlessUsers} />

        <h2 className="sr-only">فهرست تیم‌ها</h2>
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
                  solo: t.solo,
                  members: t.members,
                  cheatPenalty: t.cheatPenalty,
                  cheatNote: t.cheatNote,
                  // فقط محورهایی که تیم در آن‌ها ایده یا محصولی دارد
                  entries: tracks
                    .filter((tr) => t.ideas.some((i) => i.trackId === tr.id) || t.products.some((p) => p.trackId === tr.id))
                    .map((tr) => ({
                      trackId: tr.id,
                      trackName: tr.name,
                      ideaSubmitted: !!t.ideas.find((i) => i.trackId === tr.id)?.submittedAt,
                      productSubmitted: !!t.products.find((p) => p.trackId === tr.id)?.submittedAt,
                    })),
                }}
              />
            ))
          )}
        </div>
      </Container>
    </>
  );
}
