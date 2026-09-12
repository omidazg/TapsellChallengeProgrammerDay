"use client";

import { useState, useTransition } from "react";
import type { Team, TeamInvite, User } from "@prisma/client";
import { Alert, Empty, Locked } from "@/components/ui";
import { createTeamAction, joinMatchmakingAction, acceptInviteAction, declineInviteAction } from "./actions";

type InviteRow = TeamInvite & { team: Team; inviter: User };

export function NoTeamPanel({ invites, registrationOpen }: { invites: InviteRow[]; registrationOpen: boolean }) {
  return (
    <div className="space-y-8">
      {invites.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-black text-brand-navy">دعوت‌نامه‌های در انتظار</h2>
          <div className="grid gap-3 sm:grid-cols-2 stagger">
            {invites.map((inv) => (
              <InviteCard key={inv.id} invite={inv} disabled={!registrationOpen} />
            ))}
          </div>
        </div>
      )}

      {registrationOpen ? (
        <div className="grid gap-6 md:grid-cols-2">
          <CreateTeamCard />
          <MatchmakingCard />
        </div>
      ) : (
        <Locked title="تشکیل تیم بسته است" desc="فاز ثبت‌نام و تیم به پایان رسیده؛ دیگر نمی‌توانی تیم بسازی یا بپیوندی." />
      )}

      {invites.length === 0 && registrationOpen === false && (
        <Empty title="عضو هیچ تیمی نیستی" desc="فاز ثبت‌نام تمام شده و دعوت‌نامه‌ای هم در انتظار نداری." />
      )}
    </div>
  );
}

function InviteCard({ invite, disabled }: { invite: InviteRow; disabled: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [handled, setHandled] = useState(false);
  const [pending, startTransition] = useTransition();

  function accept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptInviteAction(invite.id);
      if (res.error) setError(res.error);
      else setHandled(true);
    });
  }
  function decline() {
    setError(null);
    startTransition(async () => {
      const res = await declineInviteAction(invite.id);
      if (res.error) setError(res.error);
      else setHandled(true);
    });
  }

  if (handled) return null;

  return (
    <div className="card p-4 anim-rise">
      <div className="font-black text-brand-navy">{invite.team.name}</div>
      <div className="mt-1 text-xs text-brand-slate">دعوت از طرف {invite.inviter.nickname}</div>
      {error && (
        <div className="mt-2">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={accept} disabled={disabled || pending} className="btn-primary !px-4 !py-1.5 text-sm">
          پذیرفتن
        </button>
        <button type="button" onClick={decline} disabled={pending} className="btn-ghost !px-4 !py-1.5 text-sm">
          رد کردن
        </button>
      </div>
    </div>
  );
}

function CreateTeamCard() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createTeamAction({ name });
      if (res.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="card p-6 anim-rise">
      <div className="text-3xl">🚀</div>
      <h3 className="mt-2 text-lg font-black text-brand-navy">ساخت تیم</h3>
      <p className="mt-1 text-sm text-brand-slate">یک اسم برای تیمت انتخاب کن و بنیان‌گذارش باش.</p>
      {error && (
        <div className="mt-3">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      <input
        className="input mt-4"
        placeholder="اسم تیم"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" disabled={pending} className="btn-primary mt-3 w-full">
        {pending ? "در حال ساخت…" : "ساخت تیم"}
      </button>
    </form>
  );
}

function MatchmakingCard() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function join() {
    setError(null);
    startTransition(async () => {
      const res = await joinMatchmakingAction();
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="card p-6 anim-rise">
      <div className="text-3xl">🧲</div>
      <h3 className="mt-2 text-lg font-black text-brand-navy">تیم برایم پیدا کن</h3>
      <p className="mt-1 text-sm text-brand-slate">به یک تیم نیازمند نقش تو ملحق می‌شوی؛ اگر جایی نبود، تیم تازه‌ای برایت ساخته می‌شود.</p>
      {error && (
        <div className="mt-3">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      <button type="button" onClick={join} disabled={pending} className="btn-cyan mt-8 w-full">
        {pending ? "در حال جست‌وجو…" : "پیدا کردن تیم"}
      </button>
    </div>
  );
}
