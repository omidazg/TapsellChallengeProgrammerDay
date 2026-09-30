import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncLeader } from "@/lib/leader";
import { getTeamLoadoutView, type LoadoutMember } from "@/lib/loadout";
import { ROLES, POWERS, type RoleKey, type PowerKey } from "@/lib/constants";
import { PageHeader, Container, Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { LoadoutPicker, type TakenBy } from "@/components/LoadoutPicker";
import { TeamProfileForm } from "./TeamProfileForm";

export const metadata = { title: "تنظیمات تیم" };

/** چه کسانی (به‌جز خود عضو) هر نقش و قدرت را دارند — برای هماهنگی در انتخاب */
function takenByOthers(members: LoadoutMember[], exceptId: string): TakenBy {
  const roles: TakenBy["roles"] = {};
  const powers: TakenBy["powers"] = {};
  for (const m of members) {
    if (m.id === exceptId) continue;
    (roles[m.role] ??= []).push(m.nickname);
    (powers[m.power] ??= []).push(m.nickname);
  }
  return { roles, powers };
}

export default async function TeamSettingsPage() {
  const user = await requireUser();
  if (!user.teamId) redirect("/team");
  await syncLeader(user.teamId);

  const [view, team] = await Promise.all([
    getTeamLoadoutView(user),
    prisma.team.findUnique({ where: { id: user.teamId }, select: { name: true, slug: true, logoSeed: true } }),
  ]);
  if (!view || !team) redirect("/team");

  const isLeader = view.leaderId === user.id;

  return (
    <>
      <PageHeader
        eyebrow="اتاق تیم"
        title="تنظیمات تیم"
        desc="نقش و قدرت اعضا را با هم هماهنگ کنید تا ترکیب تیم بهینه شود."
        action={<Link href="/team" className="btn-ghost">بازگشت به اتاق تیم</Link>}
      />
      <Container>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {view.open ? (
              <Alert kind="info">
                تا پایان فاز «ثبت‌نام و تیم» هر عضو نقش و قدرت خودش را می‌تواند عوض کند
                {view.canManage ? "؛ تو به‌عنوان سرپرست چیدمان همهٔ اعضا را هم می‌توانی تنظیم کنی." : "."} با شروع «اتاق ایده» همه‌چیز قفل می‌شود.
              </Alert>
            ) : (
              <Alert kind="info">🔒 بازی شروع شده؛ نقش، قدرت و تنظیمات تیم دیگر قفل‌اند.</Alert>
            )}

            <section className="space-y-3">
              <h2 className="text-lg font-black text-brand-navy">چیدمان اعضا</h2>
              {view.members.map((m) => {
                const editable = view.open && (m.id === user.id || view.canManage);
                return (
                  <div key={m.id} className={`card p-5 anim-rise ${m.id === user.id ? "ring-2 ring-brand-cyan" : ""}`}>
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <Avatar seed={m.avatarSeed} size={44} />
                      <div className="font-black text-brand-navy break-words">
                        {m.nickname}
                        {m.id === user.id && <span className="mr-1.5 text-xs font-bold text-brand-slate">(خودت)</span>}
                        {m.isLeader && <span className="chip-ok mr-1.5 text-[11px]">👑 سرپرست</span>}
                      </div>
                    </div>
                    {editable ? (
                      <LoadoutPicker
                        targetId={m.id}
                        role={m.role}
                        power={m.power}
                        powerLocked={m.powerLocked}
                        takenBy={takenByOthers(view.members, m.id)}
                        compact={m.id !== user.id}
                        idPrefix={`lo-${m.id}`}
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <span className="chip-red">{ROLES[m.role]?.emoji} {ROLES[m.role]?.label}</span>
                        <span className="chip-cyan">{POWERS[m.power]?.emoji} {POWERS[m.power]?.label}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          </div>

          <div className="space-y-4">
            <div className="card p-5 anim-rise">
              <h3 className="mb-3 font-black text-brand-navy">ترکیب تیم</h3>
              <CompositionHints missingRoles={view.missingRoles} duplicatePowers={view.duplicatePowers} />
            </div>

            <div className="card p-5 anim-rise">
              <h3 className="mb-3 font-black text-brand-navy">⚙️ نام و نشان تیم</h3>
              {view.open && view.canManage ? (
                <TeamProfileForm key={`${team.name}-${team.logoSeed}`} name={team.name} logoSeed={team.logoSeed || team.slug} />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar seed={team.logoSeed || team.slug} size={56} />
                    <div className="font-black text-brand-navy break-words">{team.name}</div>
                  </div>
                  <p className="text-xs text-brand-slate">
                    {!view.open
                      ? "بازی شروع شده و نام تیم قفل است."
                      : isLeader
                        ? ""
                        : view.manageReason ?? ""}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}

function CompositionHints({ missingRoles, duplicatePowers }: { missingRoles: RoleKey[]; duplicatePowers: PowerKey[] }) {
  if (missingRoles.length === 0 && duplicatePowers.length === 0) {
    return <p className="text-sm text-emerald-700">✓ هر سه نقش پوشش دارند و قدرت‌ها تکراری نیستند.</p>;
  }
  return (
    <ul className="space-y-2 text-sm text-brand-navy">
      {missingRoles.length > 0 && (
        <li>
          <span className="font-bold text-brand-red">نقش خالی:</span>{" "}
          {missingRoles.map((r) => `${ROLES[r].emoji} ${ROLES[r].label}`).join("، ")}
        </li>
      )}
      {duplicatePowers.length > 0 && (
        <li>
          <span className="font-bold text-amber-700">قدرت تکراری:</span>{" "}
          {duplicatePowers.map((p) => `${POWERS[p].emoji} ${POWERS[p].label}`).join("، ")}
          <div className="mt-1 text-xs text-brand-slate">قدرت‌های متفاوت گزینه‌های بیشتری در بازی به تیم می‌دهند.</div>
        </li>
      )}
    </ul>
  );
}
