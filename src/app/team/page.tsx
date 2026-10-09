import { requireUser } from "@/lib/auth";
import { getPhase, phaseIndex } from "@/lib/phase";
import { prisma } from "@/lib/db";
import { getTeamWithMembers } from "@/lib/team";
import { getEffectiveGameValues } from "@/lib/game-values";
import { PageHeader, Container, Alert } from "@/components/ui";
import { NoTeamPanel } from "./NoTeamPanel";
import { TeamPanel } from "./TeamPanel";

export const metadata = { title: "اتاق تیم" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ joined?: string }> }) {
  const user = await requireUser();
  const [{ phase }, values, { joined }] = await Promise.all([getPhase(), getEffectiveGameValues(), searchParams]);
  const registrationOpen = phase === "REGISTRATION";
  const formingOpen = phaseIndex(phase) <= phaseIndex("IDEATION");
  // جبران تیم کوچک در داوری انسانی (تنظیم برگزارکننده یا پیش‌فرض)
  const boost = { solo: values.soloBoostPct, duo: values.duoBoostPct };

  if (user.teamId) {
    const team = await getTeamWithMembers(user.teamId);
    return (
      <>
        <PageHeader eyebrow="اتاق تیم" title={team?.name ?? "اتاق تیم"} desc="اعضای تیم، دعوت هم‌تیمی و پیشرفت کارها." />
        <Container>
          {joined === "1" && (
            <div className="mb-4">
              <Alert kind="ok">به تیم پیوستی! خوش آمدی 🎉</Alert>
            </div>
          )}
          {team && (
            <TeamPanel
              team={team}
              currentUserId={user.id}
              registrationOpen={registrationOpen}
              formingOpen={formingOpen}
              boost={boost}
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
      <PageHeader eyebrow="اتاق تیم" title="اتاق تیم" desc="تنها بازی کن یا با یک تا دو هم‌تیمی؛ تیم‌ها ۱ تا ۳ نفره‌اند." />
      <Container>
        <NoTeamPanel invites={invites} formingOpen={formingOpen} boost={boost} />
      </Container>
    </>
  );
}
