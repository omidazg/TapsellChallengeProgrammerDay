import { requireUser } from "@/lib/auth";
import { getPhase, phaseIndex } from "@/lib/phase";
import { prisma } from "@/lib/db";
import { getTeamWithMembers, roleCoverage } from "@/lib/team";
import { PageHeader, Container, Alert } from "@/components/ui";
import { NoTeamPanel } from "./NoTeamPanel";
import { TeamPanel } from "./TeamPanel";

export const metadata = { title: "اتاق تیم" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ joined?: string }> }) {
  const user = await requireUser();
  const { phase } = await getPhase();
  const registrationOpen = phase === "REGISTRATION";
  const formingOpen = phaseIndex(phase) <= phaseIndex("IDEATION");
  const { joined } = await searchParams;

  if (user.teamId) {
    const team = await getTeamWithMembers(user.teamId);
    return (
      <>
        <PageHeader eyebrow="اتاق تیم" title={team?.name ?? "اتاق تیم"} desc="ترکیب تیم، پوشش نقش‌ها و پیشرفت کارها." />
        <Container>
          {joined === "1" && (
            <div className="mb-4">
              <Alert kind="ok">به تیم پیوستی! خوش آمدی 🎉</Alert>
            </div>
          )}
          {team && (
            <TeamPanel
              team={team}
              coverage={roleCoverage(team.members)}
              currentUserId={user.id}
              registrationOpen={registrationOpen}
              formingOpen={formingOpen}
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
        <NoTeamPanel invites={invites} registrationOpen={registrationOpen} formingOpen={formingOpen} />
      </Container>
    </>
  );
}
