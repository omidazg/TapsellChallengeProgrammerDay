import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader, Container, Stat, Coin } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { ROLES, type RoleKey } from "@/lib/constants";
import { fa } from "@/lib/persian";
import { computeBadges } from "@/lib/badges";
import { isTeamSettingsOpen } from "@/lib/team-settings";
import { BadgeGrid } from "./BadgeGrid";
import { EditProfileForm } from "./EditProfileForm";
import { SkillPicker } from "./SkillPicker";
import { ShareCard } from "./ShareCard";
import { PhoneCard } from "./PhoneCard";
import { smsEnabled } from "@/lib/sms";

export const metadata = { title: "پروفایل" };

export default async function ProfilePage() {
  const user = await requireUser();
  // نقش قدیمی نامعتبر (اگر باشد) نمایش داده نمی‌شود
  const role = user.role in ROLES ? (user.role as RoleKey) : null;
  const [badges, skillOpen] = await Promise.all([computeBadges(user.id), isTeamSettingsOpen()]);

  return (
    <>
      <PageHeader eyebrow="پروفایل" title={user.nickname} desc="شخصیت، آمار و کارت اشتراک‌گذاری‌ات." />
      <Container>
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-6">
            <div className="card p-6 text-center anim-rise">
              <Avatar seed={user.avatarSeed || user.id} size={140} className="mx-auto" />
              <h2 className="mt-4 text-xl font-black text-brand-navy">{user.nickname}</h2>
              {role && (
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  <span className="chip-cyan" title="مهارت اصلی">{ROLES[role].emoji} {ROLES[role].label}</span>
                </div>
              )}
              <div className="mt-3 text-xs text-brand-slate">{user.department}</div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs">
                <Coin n={user.buyWallet} label="کیف سکه" />
                <Link href="/coins" className="inline-flex items-center min-h-11 font-bold text-brand-cyan-dark hover:underline">
                  + خرید سکه
                </Link>
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
              department={user.department}
              avatarSeed={user.avatarSeed || user.id}
              stats={{ coffee: user.coffee, bugs: user.bugs, sleep: user.sleep, confidence: user.confidence }}
            />
            <div className="card p-6 anim-rise scroll-mt-24" id="skill">
              <h2 className="mb-1 text-lg font-black text-brand-navy">مهارت اصلی</h2>
              <p className="mb-4 text-sm text-brand-slate">فقط برای معرفی و پیدا کردن هم‌تیمی است و در امتیاز اثری ندارد.</p>
              {skillOpen ? (
                <SkillPicker role={role} />
              ) : (
                <p className="text-sm text-brand-slate">
                  🔒 فاز «اتاق ایده» تمام شده و مهارتت قفل است{role ? `: ${ROLES[role].emoji} ${ROLES[role].label}` : "."}
                </p>
              )}
            </div>
            <div className="card p-6 anim-rise">
              <h2 className="mb-4 text-lg font-black text-brand-navy">ویرایش شخصیت</h2>
              <EditProfileForm
                nickname={user.nickname}
                stats={{ coffee: user.coffee, bugs: user.bugs, sleep: user.sleep, confidence: user.confidence }}
              />
            </div>
            <PhoneCard phone={user.phone} smsEnabled={smsEnabled()} />
            <div className="card p-6 anim-rise">
              <h2 className="mb-1 text-lg font-black text-brand-navy">نشان‌ها</h2>
              <p className="mb-4 text-sm text-brand-slate">نشان‌های روشن را گرفته‌ای؛ نشان‌های خاکستری هنوز قفل‌اند.</p>
              <BadgeGrid badges={badges} />
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}
