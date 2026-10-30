"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Alert, Locked } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmDialog";
import { ROLES, type RoleKey } from "@/lib/constants";
import { fa, jdatetime } from "@/lib/persian";
import { copyText } from "@/lib/clipboard";
import type { TeamWithMembers } from "@/lib/team";
import { inviteAction, leaveTeamAction, goSoloAction, openSoloTeamAction, regenerateInviteLinkAction } from "./actions";

const TEAM_FULL = 3;

const noopSubscribe = () => () => {};

/** نشانی کامل لینک پیوستن؛ روی سرور و در hydration مسیر نسبی برمی‌گرداند تا ناهمخوانی رندر پیش نیاید */
function useJoinLink(inviteToken: string) {
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );
  return `${origin}/join/${inviteToken}`;
}

/** آیا مرورگر اشتراک‌گذاری بومی دارد؟ روی سرور و در hydration false تا رندر یکسان بماند */
function useCanShare() {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false
  );
}

function joinInputId(inviteToken: string) {
  return `join-link-${inviteToken}`;
}

/** کپی و اشتراک‌گذاری لینک پیوستن؛ اگر کپی نشد، کادر لینک انتخاب می‌شود تا دستی کپی شود */
function useInviteLink(inviteToken: string, teamName: string) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const canShare = useCanShare();

  async function copy() {
    const ok = await copyText(`${window.location.origin}/join/${inviteToken}`);
    if (ok) {
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      setFailed(true);
      const el = document.getElementById(joinInputId(inviteToken)) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: `دعوت به تیم ${teamName}`,
        text: `به تیم «${teamName}» در میدان بنیان‌گذاران بپیوند:`,
        url: `${window.location.origin}/join/${inviteToken}`,
      });
    } catch (e) {
      // بستن پنجرهٔ اشتراک توسط کاربر خطا نیست؛ خطای واقعی → کپی
      if ((e as { name?: string })?.name !== "AbortError") await copy();
    }
  }

  return { copied, failed, canShare, copy, share };
}

export function TeamPanel({
  team,
  currentUserId,
  formingOpen,
  lockTitle,
  lockDesc,
  progress,
}: {
  team: TeamWithMembers;
  currentUserId: string;
  /** تشکیل و تغییر اعضا الان ممکن است (بخش تیم باز و محصولی ثبت نهایی نشده) */
  formingOpen: boolean;
  lockTitle: string;
  lockDesc: string;
  /** پیشرفت تیم در هر محور */
  progress: { trackId: string; trackName: string; ideaDone: boolean; productDone: boolean }[];
}) {
  const size = team.members.length;
  const full = size >= TEAM_FULL;
  // تیم فردی بسته است: نه جای خالی نشان داده می‌شود، نه دعوت
  const solo = team.solo;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div className="card flex flex-wrap items-center gap-4 p-6 anim-rise">
          <Avatar seed={team.logoSeed || team.slug} size={72} />
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-xl sm:text-2xl font-black text-brand-navy break-words">{team.name}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className={solo ? "chip-gold" : "chip-navy"}>
                {solo ? "🧑‍🚀 شرکت فردی" : `👥 تیم ${fa(size)} نفره`}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Link href="/team/settings" className="btn-cyan">
              ⚙️ نام و نشان تیم
            </Link>
          </div>
        </div>

        <TeamSizeCard size={size} solo={solo} formingOpen={formingOpen} inviteToken={team.inviteToken ?? ""} teamName={team.name} />

        <div>
          <h3 className="mb-3 text-lg font-black text-brand-navy">
            اعضای تیم ({fa(size)} از {fa(TEAM_FULL)})
          </h3>
          <div className="grid gap-3 sm:grid-cols-3 stagger">
            {team.members.map((m) => {
              const role = m.role as RoleKey;
              return (
                <div key={m.id} className={`card p-4 ${m.id === currentUserId ? "ring-2 ring-brand-cyan" : ""}`}>
                  <Avatar seed={m.avatarSeed || m.id} size={56} />
                  <div className="mt-2 font-black text-brand-navy break-words">
                    {m.nickname}
                    {m.id === currentUserId && <span className="mr-1.5 text-xs font-bold text-brand-slate">(خودت)</span>}
                  </div>
                  {ROLES[role] && (
                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                      <span className="chip-cyan" title="مهارت اصلی">{ROLES[role].emoji} {ROLES[role].label}</span>
                    </div>
                  )}
                </div>
              );
            })}
            {!solo &&
              Array.from({ length: TEAM_FULL - size }).map((_, i) => (
                <EmptySlot key={`empty-${i}`} inviteToken={team.inviteToken ?? ""} teamName={team.name} canInvite={formingOpen && !full} />
              ))}
          </div>
        </div>

        {formingOpen ? (
          <InviteForm full={full} solo={solo} pendingInvites={team.invites} inviteToken={team.inviteToken ?? ""} />
        ) : (
          <Locked
            title={lockTitle}
            desc={lockDesc}
          />
        )}

        {formingOpen && <LeaveButton lastMember={size <= 1} />}
      </div>

      <div className="space-y-4">
        <div className="card p-5 anim-rise">
          <h3 className="mb-2 font-black text-brand-navy">🤝 همه هم‌اختیارند</h3>
          <p className="text-sm text-brand-slate leading-7">
            هر عضو تیم می‌تواند ایده و محصول را ثبت و ویرایش کند، محصول را به صف حراج بفرستد، برای جایگاه تبلیغاتی پیشنهاد بدهد و
            درخواست انتشار در بازار استودیو بدهد. هر خرجی از کیف سکهٔ خود همان نفر برداشته می‌شود.
          </p>
        </div>
        <div className="card p-5 anim-rise">
          <h3 className="mb-1 font-black text-brand-navy">پیشرفت تیم</h3>
          <p className="mb-3 text-xs text-brand-slate leading-6">هر تیم با سرعت خودش جلو می‌رود: اول ایده، بعد محصول. می‌توانی در چند محور با ایده و محصول جدا شرکت کنی.</p>
          <div className="space-y-3">
            {progress.map((p) => (
              <div key={p.trackId}>
                <div className="mb-1 text-xs font-bold text-brand-slate">{p.trackName}</div>
                <ChecklistItem done={p.ideaDone} label="ایده ثبت شده؟" href={`/idea?track=${encodeURIComponent(p.trackId)}`} />
                <ChecklistItem done={p.productDone} label="محصول ثبت شده؟" href={`/build?track=${encodeURIComponent(p.trackId)}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * وضعیت اندازهٔ تیم: تیم‌ها ۱ تا ۳ نفره‌اند و تعداد اعضا در امتیاز هیچ اثری ندارد.
 * تیم فردی را می‌شود برای هم‌تیمی باز کرد؛ تیم یک‌نفرهٔ باز را می‌شود «شرکت فردی» کرد.
 */
function TeamSizeCard({
  size,
  solo,
  formingOpen,
  inviteToken,
  teamName,
}: {
  size: number;
  solo: boolean;
  formingOpen: boolean;
  inviteToken: string;
  teamName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const full = size >= TEAM_FULL;
  const confirm = useConfirm();

  async function run(action: () => Promise<{ error?: string }>, confirmText: string) {
    if (!(await confirm(confirmText))) return;
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="card p-5 anim-rise space-y-3">
      <p className="text-sm text-brand-navy leading-7">
        {solo ? (
          <>فردی شرکت کرده‌ای و تیمت هم‌تیمی نمی‌پذیرد. تعداد اعضای تیم در امتیاز هیچ اثری ندارد.</>
        ) : (
          <>
            تیم‌ها ۱ تا ۳ نفره‌اند و تعداد اعضای تیم در امتیاز هیچ اثری ندارد.
            {!full && formingOpen && " اگر خواستی، تا پیش از ثبت نهایی محصول هم‌تیمی دعوت کن."}
          </>
        )}
      </p>

      {error && <Alert kind="error">{error}</Alert>}

      {formingOpen && solo && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(openSoloTeamAction, "تیمت برای پذیرفتن هم‌تیمی باز شود؟ دیگر «شرکت فردی» نیستی و تا پیش از ثبت نهایی محصول می‌توانی هم‌تیمی دعوت کنی.")
          }
          className="btn-cyan"
        >
          {pending ? "در حال باز کردن…" : "🔓 باز کردن تیم برای هم‌تیمی"}
        </button>
      )}

      {formingOpen && !solo && size === 1 && (
        <div className="space-y-2">
          <CopyJoinLink inviteToken={inviteToken} teamName={teamName} />
          <button
            type="button"
            disabled={pending}
            onClick={() => run(goSoloAction, "فردی شرکت می‌کنی؟ تیمت بسته می‌شود و دعوت‌های در انتظار لغو می‌شوند.")}
            className="btn-ghost !py-1.5 !px-3 text-sm"
          >
            {pending ? "در حال ثبت…" : "🧑‍🚀 فردی شرکت می‌کنم"}
          </button>
        </div>
      )}

      {formingOpen && !solo && size === 2 && <CopyJoinLink inviteToken={inviteToken} teamName={teamName} />}
    </div>
  );
}

function CopyJoinLink({ inviteToken, teamName }: { inviteToken: string; teamName: string }) {
  const inputId = joinInputId(inviteToken);
  const url = useJoinLink(inviteToken);
  const { copied, failed, canShare, copy, share } = useInviteLink(inviteToken, teamName);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [renewing, startRenew] = useTransition();
  const confirm = useConfirm();

  /** لینک تازه؛ وقتی لینک قبلی جایی پخش شده که نباید */
  async function renew() {
    const ok = await confirm({
      title: "لینک دعوت تازه ساخته شود؟",
      body: "لینک فعلی دیگر کار نمی‌کند و باید لینک تازه را برای هم‌تیمی‌ها بفرستی.",
      confirmLabel: "ساخت لینک تازه",
    });
    if (!ok) return;
    setRenewError(null);
    startRenew(async () => {
      const res = await regenerateInviteLinkAction();
      if (res.error) setRenewError(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="w-full text-xs text-brand-slate">
        این لینک فقط برای کسانی است که می‌خواهی هم‌تیمی‌ات شوند؛ هر کس آن را داشته باشد می‌تواند به تیم بپیوندد.
      </p>
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
      {canShare && (
        <button type="button" onClick={share} className="btn-ghost !py-1.5 !px-3 text-sm shrink-0">
          <span aria-hidden>📤</span> اشتراک‌گذاری
        </button>
      )}
      <button type="button" onClick={renew} disabled={renewing} className="btn-ghost !py-1.5 !px-3 text-sm shrink-0">
        {renewing ? "در حال ساخت…" : "🔄 لینک تازه"}
      </button>
      {failed && (
        <p className="w-full text-xs text-brand-navy/70">کپی خودکار ممکن نشد؛ لینک انتخاب شده، با Ctrl+C کپی کن.</p>
      )}
      {renewError && (
        <div className="w-full">
          <Alert kind="error">{renewError}</Alert>
        </div>
      )}
    </div>
  );
}

/** جای خالی عضو (اختیاری) و دعوت همان‌جا */
function EmptySlot({ inviteToken, teamName, canInvite }: { inviteToken: string; teamName: string; canInvite: boolean }) {
  const { copied, canShare, copy, share } = useInviteLink(inviteToken, teamName);

  return (
    <div className="card flex flex-col items-center justify-center gap-2 border-2 border-dashed border-brand-mist p-4 text-center">
      <div className="text-2xl" aria-hidden>➕</div>
      <div className="text-sm font-bold text-brand-navy">جای یک هم‌تیمی (اختیاری)</div>
      {canInvite && (
        <div className="flex flex-wrap justify-center gap-1.5">
          <button type="button" onClick={copy} className="btn-cyan !px-2.5 !py-1.5 !text-xs" aria-live="polite">
            {copied ? "کپی شد ✓" : "کپی لینک دعوت"}
          </button>
          {canShare ? (
            <button type="button" onClick={share} className="btn-ghost !px-2.5 !py-1.5 !text-xs">
              <span aria-hidden>📤</span> اشتراک‌گذاری
            </button>
          ) : (
            <a href="#invite" className="btn-ghost !px-2.5 !py-1.5 !text-xs">
              دعوت با ایمیل
            </a>
          )}
        </div>
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

  const confirm = useConfirm();

  async function leave() {
    const msg = lastMember
      ? "تو آخرین عضو این تیمی؛ با خروج، تیم و دعوت‌نامه‌هایش حذف می‌شود. مطمئنی؟"
      : "مطمئنی می‌خواهی تیم را ترک کنی؟";
    if (!(await confirm({ title: msg, confirmLabel: "ترک تیم", destructive: true }))) return;
    setError(null);
    startTransition(async () => {
      const res = await leaveTeamAction();
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="border-t border-brand-mist pt-4 text-left">
      {error && (
        <div className="mb-2 text-right">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      <button
        type="button"
        onClick={leave}
        disabled={pending}
        className="text-xs font-bold text-brand-red underline-offset-4 hover:underline disabled:opacity-50"
      >
        {pending ? "در حال خروج…" : "ترک تیم"}
      </button>
    </div>
  );
}

function InviteForm({
  full,
  solo,
  pendingInvites,
  inviteToken,
}: {
  full: boolean;
  solo: boolean;
  pendingInvites: TeamWithMembers["invites"];
  inviteToken: string;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okEmail, setOkEmail] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const joinLink = useJoinLink(inviteToken);

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
    <div className="card p-5 anim-rise scroll-mt-24" id="invite">
      <h3 className="mb-3 font-black text-brand-navy">دعوت هم‌تیمی (اختیاری)</h3>
      {solo ? (
        <Alert kind="info">فردی شرکت کرده‌ای؛ برای دعوت هم‌تیمی اول تیمت را باز کن.</Alert>
      ) : full ? (
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
