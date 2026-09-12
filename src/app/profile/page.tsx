import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader, Container, Stat, Coin } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { ROLES, POWERS, type RoleKey, type PowerKey } from "@/lib/constants";
import { fa } from "@/lib/persian";
import { EditProfileForm } from "./EditProfileForm";
import { ShareCard } from "./ShareCard";

export const metadata = { title: "پروفایل" };

export default async function ProfilePage() {
  const user = await requireUser();
  const role = user.role as RoleKey;
  const power = user.power as PowerKey;

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
                <span className={`chip-cyan ${user.powerUsed ? "opacity-60" : ""}`}>
                  {POWERS[power]?.emoji} {POWERS[power]?.label} {user.powerUsed ? "· استفاده‌شده" : ""}
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
            <div className="card p-6 anim-rise">
              <h3 className="mb-4 text-lg font-black text-brand-navy">ویرایش شخصیت</h3>
              <EditProfileForm
                nickname={user.nickname}
                stats={{ coffee: user.coffee, bugs: user.bugs, sleep: user.sleep, confidence: user.confidence }}
              />
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}
