"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { coins } from "@/lib/persian";
import { renameTeamAction, removeMemberAction, deleteTeamAction, type TeamsActionState } from "./actions";

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

export function TeamRow({ team }: { team: TeamRowData }) {
  const [renaming, setRenaming] = useState(false);
  const [renameState, renameAction] = useActionState<TeamsActionState, FormData>(renameTeamAction, {});
  const [removeState, removeAction] = useActionState<TeamsActionState, FormData>(removeMemberAction, {});
  const [deleteState, deleteAction] = useActionState<TeamsActionState, FormData>(deleteTeamAction, {});

  return (
    <div className="card p-5 space-y-3 anim-rise">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Avatar seed={team.logoSeed || team.id} size={36} />
          {renaming ? (
            <form action={renameAction} className="flex items-center gap-2">
              <input type="hidden" name="teamId" value={team.id} />
              <input name="name" defaultValue={team.name} className="input !py-1.5 !px-3 w-48" />
              <button type="submit" className="btn-primary !py-1.5 !px-3">ذخیره</button>
              <button type="button" className="btn-ghost !py-1.5 !px-3" onClick={() => setRenaming(false)}>انصراف</button>
            </form>
          ) : (
            <div>
              <div className="font-black text-brand-navy">{team.name}</div>
              <div className="text-xs text-brand-slate">خزانه: {coins(team.treasury)}</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
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
          <form key={m.id} action={removeAction} className="flex items-center gap-1.5 rounded-pill bg-brand-ice px-2.5 py-1.5">
            <input type="hidden" name="userId" value={m.id} />
            <Avatar seed={m.avatarSeed || m.id} size={22} />
            <span className="text-sm font-bold text-brand-navy">{m.nickname}</span>
            <button type="submit" className="text-brand-red text-xs font-bold hover:underline" title="حذف از تیم">✕</button>
          </form>
        ))}
        {team.members.length === 0 && <span className="text-xs text-brand-slate">بدون عضو</span>}
      </div>
      {removeState.error && <Alert kind="error">{removeState.error}</Alert>}

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
