"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { coins } from "@/lib/persian";
import { renameTeamAction, removeMemberAction, deleteTeamAction, moveMemberAction, type TeamsActionState } from "./actions";

type Member = { id: string; nickname: string; avatarSeed: string; role: string };
export type TeamRowData = {
  id: string;
  name: string;
  slug: string;
  logoSeed: string;
  treasury: number;
  members: Member[];
  ideaSubmitted: boolean;
  productSubmitted: boolean;
};

export function TeamRow({ team, allTeams }: { team: TeamRowData; allTeams: { id: string; name: string }[] }) {
  const [renaming, setRenaming] = useState(false);
  const [renameState, renameAction] = useActionState<TeamsActionState, FormData>(renameTeamAction, {});
  const [removeState, removeAction] = useActionState<TeamsActionState, FormData>(removeMemberAction, {});
  const [deleteState, deleteAction] = useActionState<TeamsActionState, FormData>(deleteTeamAction, {});
  const [moveState, moveAction] = useActionState<TeamsActionState, FormData>(moveMemberAction, {});
  const otherTeams = allTeams.filter((t) => t.id !== team.id);

  return (
    <div className="card p-4 sm:p-6 space-y-3 anim-rise">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <Avatar seed={team.logoSeed || team.id} size={36} />
          {renaming ? (
            <form action={renameAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="teamId" value={team.id} />
              <input name="name" defaultValue={team.name} className="input !py-1.5 !px-3 w-full sm:w-48" />
              <button type="submit" className="btn-primary !py-1.5 !px-3">ذخیره</button>
              <button type="button" className="btn-ghost !py-1.5 !px-3" onClick={() => setRenaming(false)}>انصراف</button>
            </form>
          ) : (
            <div className="min-w-0">
              <div className="font-black text-brand-navy break-words">{team.name}</div>
              <div className="text-xs text-brand-slate">خزانه: {coins(team.treasury)}</div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`chip ${team.ideaSubmitted ? "chip-ok" : "chip-navy"}`}>{team.ideaSubmitted ? "ایده ثبت شد" : "بدون ایده"}</span>
          <span className={`chip ${team.productSubmitted ? "chip-ok" : "chip-navy"}`}>{team.productSubmitted ? "محصول ثبت شد" : "بدون محصول"}</span>
          {!renaming && (
            <button type="button" className="btn-ghost !py-1.5 !px-3" onClick={() => setRenaming(true)}>تغییر نام</button>
          )}
        </div>
      </div>

      {renameState.error && <Alert kind="error">{renameState.error}</Alert>}

      <div className="flex flex-wrap gap-2">
        {team.members.map((m) => (
          <div key={m.id} className="flex items-center gap-1.5 rounded-pill bg-brand-ice px-2.5 py-1.5">
            <Avatar seed={m.avatarSeed || m.id} size={22} />
            <span className="text-sm font-bold text-brand-navy">{m.nickname}</span>
            {otherTeams.length > 0 && (
              <form action={moveAction} className="flex items-center gap-1">
                <input type="hidden" name="userId" value={m.id} />
                <select name="targetTeamId" defaultValue="" className="input !py-0.5 !px-1.5 !text-[11px] !w-auto">
                  <option value="" disabled>انتقال به…</option>
                  {otherTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button type="submit" className="text-brand-navy text-xs font-bold hover:underline" title="انتقال به تیم دیگر">↪</button>
              </form>
            )}
            <form action={removeAction}>
              <input type="hidden" name="userId" value={m.id} />
              <button type="submit" className="text-brand-red text-xs font-bold hover:underline" title="حذف از تیم">✕</button>
            </form>
          </div>
        ))}
        {team.members.length === 0 && <span className="text-xs text-brand-slate">بدون عضو</span>}
      </div>
      {removeState.error && <Alert kind="error">{removeState.error}</Alert>}
      {moveState.error && <Alert kind="error">{moveState.error}</Alert>}
      {moveState.ok && <Alert kind="ok">کاربر منتقل شد.</Alert>}

      {team.members.length === 0 && (
        <form action={deleteAction}>
          <input type="hidden" name="teamId" value={team.id} />
          <button type="submit" className="text-brand-red text-xs font-bold hover:underline">حذف تیم خالی</button>
        </form>
      )}
      {deleteState.error && <Alert kind="error">{deleteState.error}</Alert>}
      {(renameState.ok || removeState.ok || deleteState.ok) && <Alert kind="ok">به‌روزرسانی شد.</Alert>}
      <div className="text-[10px] text-brand-slate fa-num">/{team.slug}</div>
    </div>
  );
}
