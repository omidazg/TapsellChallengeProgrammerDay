import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isTeamSettingsOpen } from "@/lib/team-settings";
import { PageHeader, Container, Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { TeamProfileForm } from "./TeamProfileForm";

export const metadata = { title: "نام و نشان تیم" };

export default async function TeamSettingsPage() {
  const user = await requireUser();
  if (!user.teamId) redirect("/team");

  const [open, team] = await Promise.all([
    isTeamSettingsOpen(user.teamId),
    prisma.team.findUnique({ where: { id: user.teamId }, select: { name: true, slug: true, logoSeed: true } }),
  ]);
  if (!team) redirect("/team");

  return (
    <>
      <PageHeader
        eyebrow="اتاق تیم"
        title="نام و نشان تیم"
        desc="هر عضو تیم می‌تواند نام و نشان تیم را عوض کند."
        action={<Link href="/team" className="btn-ghost">بازگشت به اتاق تیم</Link>}
      />
      <Container>
        <div className="max-w-xl space-y-6">
          {open ? (
            <Alert kind="info">
              نام و نشان تیم روی ایده و محصول نمایش داده می‌شوند. مهارت خودت را از{" "}
              <Link href="/profile#skill" className="font-bold underline underline-offset-2">پروفایل</Link> عوض کن.
            </Alert>
          ) : (
            <Alert kind="info">🔒 بخش تیم فعلاً باز نیست و نام و نشان تیم قابل تغییر نیستند.</Alert>
          )}

          <div className="card p-5 anim-rise">
            <h2 className="mb-3 font-black text-brand-navy">⚙️ نام و نشان تیم</h2>
            {open ? (
              <TeamProfileForm key={`${team.name}-${team.logoSeed}`} name={team.name} logoSeed={team.logoSeed || team.slug} />
            ) : (
              <div className="flex items-center gap-3">
                <Avatar seed={team.logoSeed || team.slug} size={56} />
                <div className="font-black text-brand-navy break-words">{team.name}</div>
              </div>
            )}
          </div>
        </div>
      </Container>
    </>
  );
}
