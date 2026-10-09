import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPhase, phaseIndex } from "@/lib/phase";
import { cache } from "react";
import { getTeamPreviewBySlug as loadTeamPreview, TEAM_FULL } from "@/lib/team";
import { fa } from "@/lib/persian";
import { PageHeader, Container, Locked, Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { JoinButton } from "./JoinActions";

/** generateMetadata و صفحه در یک درخواست یک کوئری مشترک می‌زنند */
const getTeamPreviewBySlug = cache(loadTeamPreview);

// همان پیام‌های src/lib/team.ts (joinBySlug) تا متن صفحه و خطای اکشن یکی باشد
const SOLO_CLOSED = "این شرکت‌کننده فردی بازی می‌کند و هم‌تیمی نمی‌پذیرد.";
const TEAM_IS_FULL = "این تیم پر شده است.";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await getTeamPreviewBySlug(slug);
  return { title: team ? `پیوستن به ${team.name}` : "لینک دعوت" };
}

export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await getTeamPreviewBySlug(slug);

  if (!team) {
    notFound();
  }

  const user = await getCurrentUser();
  const { phase } = await getPhase();
  const formingOpen = phaseIndex(phase) <= phaseIndex("IDEATION");
  // ثبت‌نام حساب جدید فقط در فاز «ثبت‌نام و تیم» باز است (همان شرط /register).
  const registrationOpen = phase === "REGISTRATION";

  return (
    <>
      <PageHeader eyebrow="لینک دعوت" title={`پیوستن به ${team.name}`} desc="از طریق این لینک می‌توانی به این تیم بپیوندی." />
      <Container>
        <div className="mx-auto max-w-md">
          <div className="card flex items-center gap-4 p-6 anim-rise">
            <Avatar seed={team.logoSeed || team.slug} size={64} />
            <div className="flex-1 min-w-0">
              <div className="font-black text-brand-navy text-lg break-words">{team.name}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {team.solo && <span className="chip-gold">🧑‍🚀 شرکت فردی</span>}
                {team.coverage
                  .filter((c) => c.present)
                  .map((c) => (
                    <span key={c.role} className="chip-cyan" title="مهارت اعضا">
                      {c.emoji} {c.label}
                    </span>
                  ))}
              </div>
              <div className="mt-1 text-xs text-brand-slate fa-num">اعضا {fa(team.memberCount)} از {fa(TEAM_FULL)}</div>
            </div>
          </div>

          <div className="mt-6">
            {!user ? (
              <div className="card p-6 anim-rise space-y-3 text-center">
                {team.solo ? (
                  <Alert kind="error">{SOLO_CLOSED}</Alert>
                ) : team.full ? (
                  <Alert kind="error">{TEAM_IS_FULL} ظرفیت هر تیم {fa(TEAM_FULL)} نفر است.</Alert>
                ) : (
                  <p className="text-sm text-brand-navy">
                    {registrationOpen
                      ? "برای پیوستن به این تیم، اول باید وارد شوی یا ثبت‌نام کنی."
                      : "برای پیوستن به این تیم، اول وارد حسابت شو. مهلت ثبت‌نام حساب جدید تمام شده است."}
                  </p>
                )}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href={`/login?next=${encodeURIComponent(`/join/${slug}`)}`} className="btn-primary w-full">
                    ورود
                  </Link>
                  {registrationOpen && (
                    <Link href={`/register?next=${encodeURIComponent(`/join/${slug}`)}`} className="btn-cyan w-full">
                      ثبت‌نام
                    </Link>
                  )}
                </div>
              </div>
            ) : user.teamId === team.id ? (
              <div className="card p-6 anim-rise text-center space-y-3">
                <Alert kind="ok">شما همین حالا عضو این تیم هستید.</Alert>
                <Link href="/team" className="btn-primary w-full">رفتن به اتاق تیم</Link>
              </div>
            ) : user.teamId ? (
              <div className="card p-6 anim-rise text-center space-y-3">
                <Alert kind="error">شما قبلاً عضو یک تیم دیگری هستید؛ برای پیوستن به این تیم، اول باید از تیم فعلی‌ات خارج شوی.</Alert>
                <Link href="/team" className="btn-ghost w-full">رفتن به اتاق تیم</Link>
              </div>
            ) : !formingOpen ? (
              <Locked
                title="پیوستن به تیم بسته است"
                desc="فاز اتاق ایده به پایان رسیده؛ برای پیوستن به تیم با برگزارکننده هماهنگ کن."
              />
            ) : team.solo ? (
              <div className="card p-6 anim-rise text-center space-y-3">
                <Alert kind="error">{SOLO_CLOSED}</Alert>
                <Link href="/team" className="btn-ghost w-full">رفتن به اتاق تیم</Link>
              </div>
            ) : team.full ? (
              <div className="card p-6 anim-rise text-center space-y-3">
                <Alert kind="error">{TEAM_IS_FULL} ظرفیت هر تیم {fa(TEAM_FULL)} نفر است.</Alert>
                <Link href="/team" className="btn-ghost w-full">رفتن به اتاق تیم</Link>
              </div>
            ) : (
              <div className="card p-6 anim-rise space-y-4 text-center">
                <p className="text-sm text-brand-navy">با پیوستن، عضو این تیم می‌شوی. تیم‌ها ۱ تا ۳ نفره‌اند و همهٔ اعضا هم‌اختیارند.</p>
                <JoinButton slug={slug} />
              </div>
            )}
          </div>
        </div>
      </Container>
    </>
  );
}
