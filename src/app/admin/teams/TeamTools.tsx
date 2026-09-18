"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { mergeTeamsAction, moveMemberAction, autoComposeAction, type TeamsActionState, type AutoComposeState } from "./actions";

type TeamOption = { id: string; name: string };
type TeamlessUser = { id: string; nickname: string; email: string; role: string; avatarSeed: string };

export function TeamTools({ teams, teamlessUsers }: { teams: TeamOption[]; teamlessUsers: TeamlessUser[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <MergeTeamsCard teams={teams} />
      <AutoComposeCard />
      {teamlessUsers.length > 0 && <TeamlessUsersCard users={teamlessUsers} teams={teams} />}
    </div>
  );
}

function MergeTeamsCard({ teams }: { teams: TeamOption[] }) {
  const [state, action] = useActionState<TeamsActionState, FormData>(mergeTeamsAction, {});

  return (
    <form action={action} className="card p-5 space-y-3 anim-rise">
      <h3 className="font-black text-brand-navy">ادغام دو تیم</h3>
      <p className="text-xs text-brand-slate">اعضای «تیم دوم» به «تیم اول» منتقل می‌شوند و تیم دوم حذف می‌شود (اگر ایده/محصول نداشته باشد و ظرفیت کافی باشد).</p>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">ادغام انجام شد.</Alert>}
      <div className="grid gap-2 sm:grid-cols-2">
        <label htmlFor="merge-team-a" className="sr-only">تیم اول (باقی می‌ماند)</label>
        <select id="merge-team-a" name="teamAId" required defaultValue="" className="input">
          <option value="" disabled>تیم اول (باقی می‌ماند)</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <label htmlFor="merge-team-b" className="sr-only">تیم دوم (حذف می‌شود)</label>
        <select id="merge-team-b" name="teamBId" required defaultValue="" className="input">
          <option value="" disabled>تیم دوم (حذف می‌شود)</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-primary w-full">ادغام کن</button>
    </form>
  );
}

function AutoComposeCard() {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      const res: AutoComposeState = await autoComposeAction();
      if (res.error) setError(res.error);
      else setSummary(res.summary ?? "");
    });
  }

  return (
    <div className="card p-5 space-y-3 anim-rise">
      <h3 className="font-black text-brand-navy">تشکیل خودکار تیم‌ها</h3>
      <p className="text-xs text-brand-slate">کاربران بی‌تیم را به تیم‌های نیمه‌کاره‌ای که نقششان را کم دارند اضافه می‌کند؛ در نبود جا، تیم تازه می‌سازد.</p>
      {error && <Alert kind="error">{error}</Alert>}
      {summary && (
        <pre dir="rtl" className="whitespace-pre-wrap rounded-xl bg-brand-ice p-3 text-xs text-brand-navy">{summary}</pre>
      )}
      <button type="button" onClick={run} disabled={pending} className="btn-cyan w-full">
        {pending ? "در حال تشکیل تیم‌ها…" : "تشکیل خودکار تیم‌ها"}
      </button>
    </div>
  );
}

function TeamlessUsersCard({ users, teams }: { users: TeamlessUser[]; teams: TeamOption[] }) {
  const [state, action] = useActionState<TeamsActionState, FormData>(moveMemberAction, {});

  return (
    <div className="card p-5 space-y-3 anim-rise md:col-span-2">
      <h3 className="font-black text-brand-navy">کاربران بی‌تیم ({users.length})</h3>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">کاربر به تیم اضافه شد.</Alert>}
      <div className="flex flex-wrap gap-2">
        {users.map((u) => (
          <form key={u.id} action={action} className="flex items-center gap-1.5 rounded-pill bg-brand-ice px-2.5 py-1.5">
            <input type="hidden" name="userId" value={u.id} />
            <Avatar seed={u.avatarSeed || u.id} size={22} />
            <span className="text-sm font-bold text-brand-navy">{u.nickname}</span>
            <label htmlFor={`add-${u.id}`} className="sr-only">افزودن {u.nickname} به تیم</label>
            <select id={`add-${u.id}`} name="targetTeamId" defaultValue="" className="input !py-0.5 !px-1.5 !text-[11px] !w-auto">
              <option value="" disabled>افزودن به…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              type="submit"
              className="text-brand-navy text-xs font-bold hover:underline"
              title="افزودن به این تیم"
              aria-label={`افزودن ${u.nickname} به تیم انتخاب‌شده`}
            >
              ↪
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
