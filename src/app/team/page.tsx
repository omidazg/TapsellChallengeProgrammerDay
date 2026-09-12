import { requireUser } from "@/lib/auth";
import { getPhase } from "@/lib/phase";
import { prisma } from "@/lib/db";
import { getTeamWithMembers, roleCoverage } from "@/lib/team";
import { PageHeader, Container } from "@/components/ui";
import { NoTeamPanel } from "./NoTeamPanel";
import { TeamPanel } from "./TeamPanel";

export const metadata = { title: "اتاق تیم" };

export default async function TeamPage() {
  const user = await requireUser();
  const { phase } = await getPhase();
  const registrationOpen = phase === "REGISTRATION";

  if (user.teamId) {
    const team = await getTeamWithMembers(user.teamId);
    return (
      <>
        <PageHeader eyebrow="اتاق تیم" title={team?.name ?? "اتاق تیم"} desc="ترکیب تیم، پوشش نقش‌ها و پیشرفت کارها." />
        <Container>
          {team && (
            <TeamPanel
              team={team}
              coverage={roleCoverage(team.members)}
              currentUserId={user.id}
              registrationOpen={registrationOpen}
            />
          )}
        </Container>
      </>
    );
  }

  const invites = await prisma.teamInvite.findMany({
    where: { email: user.email, status: "PENDING" },
    include: { team: true, inviter: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader eyebrow="اتاق تیم" title="اتاق تیم" desc="تیم سه‌نفره‌ات را بساز یا پیدا کن." />
      <Container>
        <NoTeamPanel invites={invites} registrationOpen={registrationOpen} />
      </Container>
    </>
  );
}
