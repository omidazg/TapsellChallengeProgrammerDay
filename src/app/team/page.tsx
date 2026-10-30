import { requireUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTeamWithMembers } from "@/lib/team";
import { moduleStatusFor } from "@/lib/module-state";
import { listVisibleTracks } from "@/lib/track-data";
import { PageHeader, Container, Alert } from "@/components/ui";
import { NoTeamPanel } from "./NoTeamPanel";
import { TeamPanel } from "./TeamPanel";

export const metadata = { title: "اتاق تیم" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ joined?: string }> }) {
  const user = await requireUser();
  const [status, { joined }] = await Promise.all([moduleStatusFor("team", user.teamId), searchParams]);
  if (status === "hidden") notFound();
  // بسته یا فقط‌خواندنی: اتاق تیم دیده می‌شود ولی تشکیل و تغییر تیم با یک اعلان قفل است.
  const moduleIsOpen = status === "open";

  if (user.teamId) {
    const [team, tracks] = await Promise.all([getTeamWithMembers(user.teamId), listVisibleTracks()]);
    // اعضا تا وقتی محصولی ثبت نهایی نشده قابل تغییرند (lib/team.ts همین را اعمال می‌کند).
    const rosterLocked = !!team?.products.some((p) => p.submittedAt);
    const progress = tracks
      .filter((t) => t.status === "open" || team?.ideas.some((i) => i.trackId === t.id) || team?.products.some((p) => p.trackId === t.id))
      .map((t) => ({
        trackId: t.id,
        trackName: t.name,
        ideaDone: !!team?.ideas.some((i) => i.trackId === t.id && i.submittedAt),
        productDone: !!team?.products.some((p) => p.trackId === t.id && p.submittedAt),
      }));
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
              formingOpen={moduleIsOpen && !rosterLocked}
              lockTitle={rosterLocked ? "اعضای تیم قفل شده‌اند" : "دعوت و پیوستن به تیم بسته است"}
              lockDesc={
                rosterLocked
                  ? "تیمت محصول ثبت نهایی کرده و اعضا دیگر عوض نمی‌شوند. برای تغییر اعضا، اول محصول را از مرکز ساخت برای ویرایش باز کن."
                  : "بخش تیم فعلاً باز نیست؛ برای تغییر ترکیب تیم با برگزارکننده هماهنگ کن."
              }
              progress={progress}
            />
          )}
        </Container>
      </>
    );
  }

  const invites = await prisma.teamInvite.findMany({
    where: { email: user.email, status: "PENDING" },
    // فقط فیلدهای لازم: این ردیف‌ها به کامپوننت کلاینت می‌روند (نه توکن دعوت تیم، نه هش رمز دعوت‌کننده)
    select: { id: true, team: { select: { name: true } }, inviter: { select: { nickname: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader eyebrow="اتاق تیم" title="اتاق تیم" desc="تنها بازی کن یا با یک تا دو هم‌تیمی؛ تیم‌ها ۱ تا ۳ نفره‌اند." />
      <Container>
        <NoTeamPanel invites={invites} formingOpen={moduleIsOpen} />
      </Container>
    </>
  );
}
