"use client";

import { useState, useTransition } from "react";
import type { Team, TeamInvite, User } from "@prisma/client";
import { Alert, Locked } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmDialog";
import { createTeamAction, joinMatchmakingAction, acceptInviteAction, declineInviteAction, goSoloAction } from "./actions";

type InviteRow = Pick<TeamInvite, "id"> & { team: Pick<Team, "name">; inviter: Pick<User, "nickname"> };

export function NoTeamPanel({ invites, formingOpen }: { invites: InviteRow[]; formingOpen: boolean }) {
  return (
    <div className="space-y-8">
      {invites.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-black text-brand-navy">دعوت‌نامه‌های در انتظار</h2>
          <div className="grid gap-3 sm:grid-cols-2 stagger">
            {invites.map((inv) => (
              <InviteCard key={inv.id} invite={inv} disabled={!formingOpen} />
            ))}
          </div>
        </div>
      )}

      {formingOpen ? (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            <CreateTeamCard />
            <MatchmakingCard />
            <SoloCard />
          </div>
          <TeamSizeNote />
        </>
      ) : (
        <Locked
          title="تشکیل تیم بسته است"
          desc="بخش تیم فعلاً باز نیست؛ الان نمی‌توانی تیم بسازی یا بپیوندی. برای تغییر ترکیب تیم با برگزارکننده هماهنگ کن."
        />
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
      <div className="font-black text-brand-navy break-words">{invite.team.name}</div>
      <div className="mt-1 text-xs text-brand-slate break-words">دعوت از طرف {invite.inviter.nickname}</div>
      {error && (
        <div className="mt-2">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
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
      <div className="text-3xl" aria-hidden>🚀</div>
      <h2 className="mt-2 text-lg font-black text-brand-navy">ساخت تیم</h2>
      <p className="mt-1 text-sm text-brand-slate">یک اسم برای تیمت انتخاب کن و یک یا دو هم‌تیمی دعوت کن.</p>
      {error && (
        <div className="mt-3" id="create-team-error">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      <label htmlFor="team-name" className="sr-only">اسم تیم</label>
      <input
        id="team-name"
        className="input mt-4"
        placeholder="اسم تیم"
        maxLength={40}
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? "create-team-error" : undefined}
      />
      <button type="submit" disabled={pending || name.trim().length < 2} className="btn-primary mt-3 w-full">
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
      <div className="text-3xl" aria-hidden>🧲</div>
      <h2 className="mt-2 text-lg font-black text-brand-navy">تیم برایم پیدا کن</h2>
      <p className="mt-1 text-sm text-brand-slate">به تیمی که جای خالی دارد (ترجیحاً تیمی که مهارت تو را ندارد) ملحق می‌شوی؛ اگر جایی نبود، تیم تازه‌ای برایت ساخته می‌شود.</p>
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

/** شرکت فردی: تیم یک‌نفرهٔ بسته که هم‌تیمی نمی‌پذیرد (بعداً از اتاق تیم قابل باز کردن است) */
function SoloCard() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = useConfirm();

  async function go() {
    if (!(await confirm({ title: "فردی شرکت می‌کنی؟", body: "تیم یک‌نفره‌ای به نام خودت ساخته می‌شود و تا وقتی بازش نکنی هم‌تیمی نمی‌پذیرد." }))) return;
    setError(null);
    startTransition(async () => {
      const res = await goSoloAction();
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="card p-6 anim-rise">
      <div className="text-3xl" aria-hidden>🧑‍🚀</div>
      <h2 className="mt-2 text-lg font-black text-brand-navy">شرکت فردی</h2>
      <p className="mt-1 text-sm text-brand-slate">
        تنها بازی کن؛ تعداد اعضای تیم در امتیاز هیچ اثری ندارد. هر وقت خواستی (تا پیش از ثبت نهایی محصول) می‌توانی تیمت را برای هم‌تیمی باز کنی.
      </p>
      {error && (
        <div className="mt-3">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      <button type="button" onClick={go} disabled={pending} className="btn-ghost mt-4 w-full">
        {pending ? "در حال ثبت…" : "فردی شرکت می‌کنم"}
      </button>
    </div>
  );
}

/** توضیح کوتاه اندازهٔ تیم */
function TeamSizeNote() {
  return (
    <div className="card p-5 bg-brand-ice anim-rise text-sm text-brand-navy leading-7">
      <b>تیم‌ها ۱ تا ۳ نفره‌اند.</b> تعداد اعضای تیم در امتیاز هیچ اثری ندارد. مهارت اعضا فقط برای معرفی است و شرط شرکت نیست؛ تشکیل یا تکمیل تیم تا پیش از ثبت نهایی محصول ممکن است.
    </div>
  );
}
