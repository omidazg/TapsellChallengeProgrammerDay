import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader, Container, Stat, Coin } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { ROLES, POWERS, type RoleKey, type PowerKey } from "@/lib/constants";
import { fa } from "@/lib/persian";
import { computeBadges } from "@/lib/badges";
import { prisma } from "@/lib/db";
import { getPhase, phaseAtLeast } from "@/lib/phase";
import { shieldPhaseAllowed } from "@/lib/shield";
import { BadgeGrid } from "./BadgeGrid";
import { EditProfileForm } from "./EditProfileForm";
import { LoadoutPicker, type TakenBy } from "@/components/LoadoutPicker";
import { isLoadoutOpen } from "@/lib/loadout";
import { ShareCard } from "./ShareCard";
import { PhoneCard } from "./PhoneCard";
import { smsEnabled } from "@/lib/sms";

export const metadata = { title: "پروفایل" };

export default async function ProfilePage() {
  const user = await requireUser();
  const role = user.role as RoleKey;
  const power = user.power as PowerKey;
  const badges = await computeBadges(user.id);
  const powerNote = await powerStatusNote(user);
  const [loadoutOpen, mates] = await Promise.all([
    isLoadoutOpen(),
    user.teamId
      ? prisma.user.findMany({
          where: { teamId: user.teamId, NOT: { id: user.id } },
          select: { nickname: true, role: true, power: true },
        })
      : Promise.resolve([]),
  ]);
  const takenBy: TakenBy = { roles: {}, powers: {} };
  for (const m of mates) {
    (takenBy.roles[m.role as RoleKey] ??= []).push(m.nickname);
    (takenBy.powers[m.power as PowerKey] ??= []).push(m.nickname);
  }

  return (
    <>
      <PageHeader eyebrow="پروفایل" title={user.nickname} desc="شخصیت، آمار و کارت اشتراک‌گذاری‌ات." />
      <Container>
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-6">
            <div className="card p-6 text-center anim-rise">
              <Avatar seed={user.avatarSeed || user.id} size={140} className="mx-auto" />
              <h2 className="mt-4 text-xl font-black text-brand-navy">{user.nickname}</h2>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <span className="chip-red">{ROLES[role]?.emoji} {ROLES[role]?.label}</span>
                <span className={`chip-cyan ${powerNote.dim ? "opacity-60" : ""}`}>
                  {POWERS[power]?.emoji} {POWERS[power]?.label} {powerNote.text}
                </span>
              </div>
              <div className="mt-3 text-xs text-brand-slate">{user.department}</div>
              <div className="mt-4 flex justify-center gap-4 text-xs">
                <Coin n={user.seedWallet} label="کیف بذر" />
                <Coin n={user.buyWallet} label="کیف خرید" />
              </div>
              {user.team ? (
                <Link href="/team" className="btn-cyan mt-5 w-full">
                  اتاق تیم: {user.team.name}
                </Link>
              ) : (
                <Link href="/team" className="btn-primary mt-5 w-full">
                  به تیم بپیوند
                </Link>
              )}
              <form action="/logout" method="post" className="mt-3">
                <button type="submit" className="btn-ghost w-full">خروج از حساب</button>
              </form>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="قهوه" value={fa(user.coffee)} />
              <Stat label="باگ" value={fa(user.bugs)} />
              <Stat label="خواب" value={fa(user.sleep)} />
              <Stat label="اعتمادبه‌نفس" value={fa(user.confidence)} />
            </div>
          </div>

          <div className="space-y-6">
            <ShareCard
              nickname={user.nickname}
              role={role}
              power={power}
              department={user.department}
              avatarSeed={user.avatarSeed || user.id}
              stats={{ coffee: user.coffee, bugs: user.bugs, sleep: user.sleep, confidence: user.confidence }}
            />
            <div className="card p-6 anim-rise" id="loadout">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-black text-brand-navy">نقش و قدرت</h3>
                {user.teamId && (
                  <Link href="/team/settings" className="text-sm font-bold text-brand-cyan-dark hover:underline">
                    ⚙️ هماهنگی با تیم
                  </Link>
                )}
              </div>
              {loadoutOpen ? (
                <>
                  <p className="mb-4 text-sm text-brand-slate">
                    تا شروع بازی (پایان فاز «ثبت‌نام و تیم») می‌توانی نقش و قدرتت را عوض کنی تا با هم‌تیمی‌هایت ترکیب بهتری بسازید.
                  </p>
                  <LoadoutPicker
                    role={role}
                    power={power}
                    powerLocked={user.powerUsed || !!user.shieldTeamId}
                    takenBy={takenBy}
                    idPrefix="profile-loadout"
                  />
                </>
              ) : (
                <p className="text-sm text-brand-slate">
                  🔒 بازی شروع شده و نقش و قدرتت قفل است: {ROLES[role]?.emoji} {ROLES[role]?.label} · {POWERS[power]?.emoji} {POWERS[power]?.label}
                </p>
              )}
            </div>
            <div className="card p-6 anim-rise">
              <h3 className="mb-4 text-lg font-black text-brand-navy">ویرایش شخصیت</h3>
              <EditProfileForm
                nickname={user.nickname}
                stats={{ coffee: user.coffee, bugs: user.bugs, sleep: user.sleep, confidence: user.confidence }}
              />
            </div>
            <PhoneCard phone={user.phone} smsEnabled={smsEnabled()} />
            <div className="card p-6 anim-rise">
              <h3 className="mb-1 text-lg font-black text-brand-navy">نشان‌ها</h3>
              <p className="mb-4 text-sm text-brand-slate">نشان‌های روشن را گرفته‌ای؛ نشان‌های خاکستری هنوز قفل‌اند.</p>
              <BadgeGrid badges={badges} />
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}

/**
 * متن کنار نشان قدرت. برای بیشتر قدرت‌ها همان «استفاده‌شده» بر اساس powerUsed است؛ اما سپر
 * بعد از انتخاب «مصرف» نمی‌شود، بلکه تا پایان بازی روی یک تیم فعال می‌ماند.
 */
async function powerStatusNote(user: { power: string; powerUsed: boolean; shieldTeamId: string | null }) {
  if (user.power !== "SHIELD") {
    return { text: user.powerUsed ? "· استفاده‌شده" : "", dim: user.powerUsed };
  }
  if (user.shieldTeamId) {
    const team = await prisma.team.findUnique({ where: { id: user.shieldTeamId }, select: { name: true } });
    return { text: team ? `· فعال روی تیم ${team.name}` : "· فعال", dim: false };
  }
  const { phase } = await getPhase();
  if (shieldPhaseAllowed(phase)) return { text: "· هنوز انتخاب نشده", dim: false };
  if (phaseAtLeast(phase, "MARKET")) return { text: "· بی‌اثر ماند", dim: true };
  return { text: "", dim: false };
}
