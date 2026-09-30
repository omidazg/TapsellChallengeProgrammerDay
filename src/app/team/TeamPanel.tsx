"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Alert, Locked } from "@/components/ui";
import { ROLES, POWERS, type RoleKey, type PowerKey } from "@/lib/constants";
import { fa, jdatetime } from "@/lib/persian";
import { copyText } from "@/lib/clipboard";
import type { RoleCoverage, TeamWithMembers } from "@/lib/team";
import { inviteAction, leaveTeamAction } from "./actions";
import { LeaderCard, type LeaderCardState } from "./LeaderCard";

const TEAM_FULL = 3;

const noopSubscribe = () => () => {};

/** نشانی کامل لینک پیوستن؛ روی سرور و در hydration مسیر نسبی برمی‌گرداند تا ناهمخوانی رندر پیش نیاید */
function useJoinLink(slug: string) {
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );
  return `${origin}/join/${slug}`;
}

export function TeamPanel({
  team,
  coverage,
  currentUserId,
  registrationOpen,
  formingOpen,
  leader,
}: {
  team: TeamWithMembers;
  coverage: RoleCoverage[];
  currentUserId: string;
  registrationOpen: boolean;
  formingOpen: boolean;
  leader: LeaderCardState;
}) {
  const full = team.members.length >= TEAM_FULL;
  const missingRoles = coverage.filter((c) => !c.present);
  const incomplete = team.members.length < TEAM_FULL || missingRoles.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div className="card flex flex-wrap items-center gap-4 p-6 anim-rise">
          <Avatar seed={team.logoSeed || team.slug} size={72} />
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-xl sm:text-2xl font-black text-brand-navy break-words">{team.name}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {coverage.map((c) => (
                <span key={c.role} className={c.present ? "chip-ok" : "chip-red"} title={c.present ? "پوشش دارد" : "خالی است"}>
                  {c.emoji} {c.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Link href="/team/settings" className="btn-cyan">
              ⚙️ {leader.leaderId === currentUserId || team.members.length <= 1 ? "تنظیمات تیم" : "نقش و قدرت اعضا"}
            </Link>
            {registrationOpen && <LeaveButton lastMember={team.members.length <= 1} />}
          </div>
        </div>

        {incomplete && (
          <IncompleteTeamCard team={team} missingRoles={missingRoles} formingOpen={formingOpen} />
        )}

        <div>
          <h3 className="mb-3 text-lg font-black text-brand-navy">اعضای تیم ({fa(team.members.length)} از {fa(TEAM_FULL)})</h3>
          <div className="grid gap-3 sm:grid-cols-3 stagger">
            {team.members.map((m) => {
              const role = m.role as RoleKey;
              const power = m.power as PowerKey;
              return (
                <div key={m.id} className={`card p-4 ${m.id === currentUserId ? "ring-2 ring-brand-cyan" : ""}`}>
                  <Avatar seed={m.avatarSeed || m.id} size={56} />
                  <div className="mt-2 font-black text-brand-navy break-words">
                    {m.nickname}
                    {m.id === leader.leaderId && (
                      <span className="chip-ok mr-1.5 text-[11px]" title="سرپرست تیم">
                        👑 سرپرست
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                    <span className="chip-red">{ROLES[role]?.emoji} {ROLES[role]?.label}</span>
                    <span className="chip-cyan">{POWERS[power]?.emoji} {POWERS[power]?.label}</span>
                  </div>
                </div>
              );
            })}
            {Array.from({ length: TEAM_FULL - team.members.length }).map((_, i) => (
              <div key={`empty-${i}`} className="card flex items-center justify-center border-dashed p-4 text-sm text-brand-slate">
                جای خالی
              </div>
            ))}
          </div>
        </div>

        {formingOpen ? (
          <InviteForm full={full} pendingInvites={team.invites} slug={team.slug} />
        ) : (
          <Locked
            title="دعوت و پیوستن به تیم بسته است"
            desc="فاز اتاق ایده به پایان رسیده؛ برای تغییر ترکیب تیم با برگزارکننده هماهنگ کن."
          />
        )}
      </div>

      <div className="space-y-4">
        <LeaderCard
          state={leader}
          members={team.members.map((m) => ({ id: m.id, nickname: m.nickname, avatarSeed: m.avatarSeed }))}
          currentUserId={currentUserId}
        />
        <div className="card p-5 anim-rise">
          <h3 className="mb-3 font-black text-brand-navy">پیشرفت تیم</h3>
          <ChecklistItem done={!!team.idea?.submittedAt} label="ایده ثبت شده؟" href="/idea" />
          <ChecklistItem done={!!team.product?.submittedAt} label="محصول ثبت شده؟" href="/build" />
        </div>
      </div>
    </div>
  );
}

function IncompleteTeamCard({
  team,
  missingRoles,
  formingOpen,
}: {
  team: TeamWithMembers;
  missingRoles: RoleCoverage[];
  formingOpen: boolean;
}) {
  const pct = Math.round((team.members.length / TEAM_FULL) * 100);
  const full = team.members.length >= TEAM_FULL;
  const missingText =
    missingRoles.length > 0 ? `نقش ${missingRoles.map((r) => r.label).join("، ")} خالی است.` : "";

  return (
    <div className="card border-2 border-brand-red/30 bg-red-50/60 p-5 anim-pop">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black text-brand-red"><span aria-hidden>⚠️</span> تیمت هنوز کامل نیست{missingText ? `: ${missingText}` : "."}</h3>
        <span className="text-xs font-bold text-brand-navy fa-num">اعضا {fa(team.members.length)}/{fa(TEAM_FULL)}</span>
      </div>
      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white"
        role="progressbar"
        aria-label="تکمیل اعضای تیم"
        aria-valuemin={0}
        aria-valuemax={TEAM_FULL}
        aria-valuenow={team.members.length}
      >
        <div className="h-full rounded-full bg-brand-red transition-all" style={{ width: `${pct}%` }} />
      </div>

      {full ? (
        <p className="mt-3 text-sm text-brand-navy">
          ظرفیت تیم پر است و عضو تازه‌ای نمی‌پذیرد؛ نبودِ این نقش را با تقسیم کار جبران کن یا برای جابه‌جایی با برگزارکننده هماهنگ کن.
        </p>
      ) : formingOpen ? (
        <p className="mt-3 text-sm text-brand-navy">
          یک هم‌تیمی دعوت کن یا لینک پیوستن تیمت را برایش بفرست — تا پایان فاز «اتاق ایده» فرصت داری.
        </p>
      ) : (
        <p className="mt-3 text-sm text-brand-navy">
          فاز اتاق ایده به پایان رسیده؛ دیگر نمی‌توانی عضو جدید اضافه کنی. برای تکمیل تیم با برگزارکننده هماهنگ کن.
        </p>
      )}

      {formingOpen && !full && (
        <div className="mt-3">
          <CopyJoinLink slug={team.slug} />
        </div>
      )}
    </div>
  );
}

function CopyJoinLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputId = useMemo(() => `join-link-${slug}`, [slug]);
  const url = useJoinLink(slug);

  async function copy() {
    const ok = await copyText(`${window.location.origin}/join/${slug}`);
    if (ok) {
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      setFailed(true);
      const el = document.getElementById(inputId) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={inputId} className="sr-only">لینک دعوت تیم</label>
      <input
        id={inputId}
        readOnly
        dir="ltr"
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="input !py-1.5 !px-3 flex-1 min-w-0 sm:min-w-[260px] text-xs"
      />
      <button type="button" onClick={copy} className="btn-cyan !py-1.5 !px-3 text-sm shrink-0" aria-live="polite">
        {copied ? "کپی شد ✓" : "کپی لینک دعوت"}
      </button>
      {failed && (
        <p className="w-full text-xs text-brand-navy/70">کپی خودکار ممکن نشد؛ لینک انتخاب شده، با Ctrl+C کپی کنید.</p>
      )}
    </div>
  );
}

function ChecklistItem({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <Link href={href} className="mb-2 flex items-center justify-between rounded-2xl bg-brand-ice px-4 py-3 text-sm font-bold text-brand-navy hover:bg-brand-mist">
      <span>{label}</span>
      <span className={done ? "chip-ok" : "chip-navy"}>{done ? "بله ✓" : "هنوز نه"}</span>
    </Link>
  );
}

function LeaveButton({ lastMember }: { lastMember: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function leave() {
    const msg = lastMember
      ? "تو آخرین عضو این تیمی؛ با خروج، تیم و دعوت‌نامه‌هایش حذف می‌شود. مطمئنی؟"
      : "مطمئنی می‌خواهی تیم را ترک کنی؟";
    if (!window.confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const res = await leaveTeamAction();
      if (res.error) setError(res.error);
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-2">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      <button type="button" onClick={leave} disabled={pending} className="btn-ghost !text-brand-red">
        {pending ? "در حال خروج…" : "ترک تیم"}
      </button>
    </div>
  );
}

function InviteForm({
  full,
  pendingInvites,
  slug,
}: {
  full: boolean;
  pendingInvites: TeamWithMembers["invites"];
  slug: string;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okEmail, setOkEmail] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const joinLink = useJoinLink(slug);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkEmail(null);
    startTransition(async () => {
      const res = await inviteAction({ email });
      if (res.error) setError(res.error);
      else {
        setOkEmail(email);
        setEmail("");
      }
    });
  }

  return (
    <div className="card p-5 anim-rise">
      <h3 className="mb-3 font-black text-brand-navy">دعوت هم‌تیمی</h3>
      {full ? (
        <Alert kind="info">تیم پر است؛ ظرفیت هر تیم سه نفر است.</Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col sm:flex-row flex-wrap gap-3">
          {error && (
            <div className="w-full" id="invite-error">
              <Alert kind="error">{error}</Alert>
            </div>
          )}
          {okEmail && (
            <div className="w-full space-y-1">
              <Alert kind="ok">
                دعوت ثبت شد؛ چون ایمیلی ارسال نمی‌شود، این لینک را برای {okEmail} بفرست:
              </Alert>
              <div dir="ltr" className="break-all rounded-xl bg-brand-ice px-3 py-2 text-xs font-bold text-brand-navy">
                {joinLink}
              </div>
            </div>
          )}
          <label htmlFor="invite-email" className="sr-only">ایمیل هم‌تیمی‌ات</label>
          <input
            id="invite-email"
            type="email"
            dir="ltr"
            required
            className="input flex-1 min-w-0 sm:min-w-[220px]"
            placeholder="ایمیل هم‌تیمی‌ات"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "invite-error" : undefined}
          />
          <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
            {pending ? "در حال ثبت…" : "دعوت کن"}
          </button>
        </form>
      )}
      {pendingInvites.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="text-xs font-bold text-brand-slate">دعوت‌های در انتظار پاسخ</div>
          {pendingInvites.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-1 rounded-xl bg-brand-ice px-3 py-2 text-xs">
              <span dir="ltr" className="min-w-0 break-all text-brand-navy">{inv.email}</span>
              {/* ساعت به منطقهٔ زمانی مرورگر وابسته است و ممکن است با رندر سرور فرق کند */}
              <span className="text-brand-slate shrink-0" suppressHydrationWarning>{jdatetime(inv.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
