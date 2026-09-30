"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { coins } from "@/lib/persian";
import {
  renameTeamAction,
  removeMemberAction,
  deleteTeamAction,
  moveMemberAction,
  setLeaderAction,
  resetLeaderAction,
  type TeamsActionState,
} from "./actions";

type Member = { id: string; nickname: string; avatarSeed: string; role: string };
type FormAction = (formData: FormData) => void;

/** انتخابگر با اندازهٔ معمولی (ارتفاع لمسی حداقل ۴۰px) به‌جای select ریز قبلی */
const SELECT_CLS = "input !py-2 !px-3 !text-sm !w-auto min-h-10 max-w-48";
/** دکمهٔ آیکونی گرد ۴۰×۴۰ برای اقدامات هر عضو */
const ICON_BTN_CLS =
  "inline-flex items-center justify-center size-10 shrink-0 rounded-full border border-brand-mist bg-white font-bold transition hover:bg-brand-ice";

/**
 * اقدامات هر عضو (انتقال به تیم دیگر، حذف از تیم) با confirm.
 * `inline` برای دسکتاپ (آیکونی، کنار نام) و `menu` برای منوی جمع‌شوندهٔ موبایل (با برچسب متنی).
 */
function MemberActions({
  variant,
  member,
  teamName,
  otherTeams,
  moveAction,
  removeAction,
}: {
  variant: "inline" | "menu";
  member: Member;
  teamName: string;
  otherTeams: { id: string; name: string }[];
  moveAction: FormAction;
  removeAction: FormAction;
}) {
  const menu = variant === "menu";
  const selectId = `move-${variant}-${member.id}`;
  return (
    <>
      {otherTeams.length > 0 && (
        <form
          action={moveAction}
          className={menu ? "space-y-1.5" : "flex items-center gap-2"}
          onSubmit={(e) => {
            const select = e.currentTarget.elements.namedItem("targetTeamId") as HTMLSelectElement | null;
            const target = select?.selectedOptions[0]?.textContent ?? "";
            if (!confirm(`${member.nickname} از «${teamName}» به «${target}» منتقل شود؟`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="userId" value={member.id} />
          <label htmlFor={selectId} className={menu ? "block text-xs font-bold text-brand-slate" : "sr-only"}>
            انتقال {member.nickname} به تیم دیگر
          </label>
          <div className="flex items-center gap-2">
            <select id={selectId} name="targetTeamId" required defaultValue="" className={menu ? `${SELECT_CLS} flex-1 !max-w-none` : SELECT_CLS}>
              <option value="" disabled>انتقال به…</option>
              {otherTeams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              type="submit"
              className={`${ICON_BTN_CLS} text-brand-navy`}
              title="انتقال به تیم دیگر"
              aria-label={`انتقال ${member.nickname} به تیم انتخاب‌شده`}
            >
              <span aria-hidden>↪</span>
            </button>
          </div>
        </form>
      )}
      <form
        action={removeAction}
        onSubmit={(e) => {
          if (!confirm(`${member.nickname} از تیم «${teamName}» حذف شود؟ او بی‌تیم می‌شود.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="userId" value={member.id} />
        {menu ? (
          <button type="submit" className="btn-ghost w-full !py-2 text-sm min-h-10 !text-brand-red" aria-label={`حذف ${member.nickname} از تیم`}>
            <span aria-hidden>✕</span> حذف از تیم
          </button>
        ) : (
          <button
            type="submit"
            className={`${ICON_BTN_CLS} text-brand-red`}
            title="حذف از تیم"
            aria-label={`حذف ${member.nickname} از تیم`}
          >
            <span aria-hidden>✕</span>
          </button>
        )}
      </form>
    </>
  );
}
export type TeamRowData = {
  id: string;
  name: string;
  slug: string;
  logoSeed: string;
  treasury: number;
  members: Member[];
  leaderId: string | null;
  ideaSubmitted: boolean;
  productSubmitted: boolean;
};

export function TeamRow({ team, allTeams }: { team: TeamRowData; allTeams: { id: string; name: string }[] }) {
  const [renaming, setRenaming] = useState(false);
  const [renameState, renameAction] = useActionState<TeamsActionState, FormData>(async (prev, formData) => {
    const res = await renameTeamAction(prev, formData);
    if (res.ok) setRenaming(false);
    return res;
  }, {});
  const [removeState, removeAction] = useActionState<TeamsActionState, FormData>(removeMemberAction, {});
  const [deleteState, deleteAction] = useActionState<TeamsActionState, FormData>(deleteTeamAction, {});
  const [moveState, moveAction] = useActionState<TeamsActionState, FormData>(moveMemberAction, {});
  const [leaderState, leaderAction] = useActionState<TeamsActionState, FormData>(setLeaderAction, {});
  const [resetState, resetAction] = useActionState<TeamsActionState, FormData>(resetLeaderAction, {});
  const leader = team.members.find((m) => m.id === team.leaderId) ?? null;
  const otherTeams = allTeams.filter((t) => t.id !== team.id);

  return (
    <div className="card p-4 sm:p-6 space-y-3 anim-rise">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <Avatar seed={team.logoSeed || team.id} size={36} />
          {renaming ? (
            <form action={renameAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="teamId" value={team.id} />
              <label htmlFor={`team-name-${team.id}`} className="sr-only">نام تیم</label>
              <input id={`team-name-${team.id}`} name="name" defaultValue={team.name} className="input !py-1.5 !px-3 w-full sm:w-48" />
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

      {team.members.length === 0 ? (
        <p className="text-xs text-brand-slate">بدون عضو</p>
      ) : (
        <ul className="space-y-2">
          {team.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-brand-ice px-3 py-2">
              <Avatar seed={m.avatarSeed || m.id} size={28} />
              <span className="text-sm font-bold text-brand-navy min-w-0 break-words">
                {m.id === team.leaderId && <span title="سرپرست تیم">👑 </span>}
                {m.nickname}
              </span>
              {/* دسکتاپ: اقدامات کنار هم؛ موبایل: جمع‌شده در منوی «اقدامات» تا ردیف شلوغ نشود */}
              <div className="hidden sm:flex items-center gap-2 ms-auto">
                <MemberActions variant="inline" member={m} teamName={team.name} otherTeams={otherTeams} moveAction={moveAction} removeAction={removeAction} />
              </div>
              <details className="sm:hidden ms-auto relative">
                <summary className="btn-ghost !py-2 !px-3 text-sm min-h-10 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  اقدامات <span aria-hidden>▾</span>
                </summary>
                <div className="absolute end-0 z-20 mt-2 w-72 max-w-[calc(100vw-4rem)] card p-3 space-y-3">
                  <MemberActions variant="menu" member={m} teamName={team.name} otherTeams={otherTeams} moveAction={moveAction} removeAction={removeAction} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      {team.members.length >= 2 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-brand-slate">سرپرست: {leader ? <b className="text-brand-navy">{leader.nickname}</b> : "در حال رأی‌گیری"}</span>
          <form action={leaderAction} className="flex items-center gap-2">
            <input type="hidden" name="teamId" value={team.id} />
            <label htmlFor={`leader-${team.id}`} className="sr-only">تعیین سرپرست {team.name}</label>
            <select id={`leader-${team.id}`} name="userId" required defaultValue="" className={SELECT_CLS}>
              <option value="" disabled>تعیین سرپرست…</option>
              {team.members.map((m) => (
                <option key={m.id} value={m.id}>{m.nickname}</option>
              ))}
            </select>
            <button type="submit" className="btn-ghost !py-2 !px-4 text-sm min-h-10">اعمال</button>
          </form>
          {leader && (
            <form
              action={resetAction}
              onSubmit={(e) => {
                if (!confirm(`سرپرستی ${team.name} برداشته و رأی‌گیری از نو باز شود؟`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="teamId" value={team.id} />
              <button type="submit" className="btn-ghost !py-2 !px-4 text-sm min-h-10 !text-brand-red">رأی‌گیری از نو</button>
            </form>
          )}
        </div>
      )}
      {leaderState.error && <Alert kind="error">{leaderState.error}</Alert>}
      {resetState.error && <Alert kind="error">{resetState.error}</Alert>}
      {removeState.error && <Alert kind="error">{removeState.error}</Alert>}
      {moveState.error && <Alert kind="error">{moveState.error}</Alert>}
      {moveState.ok && <Alert kind="ok">کاربر منتقل شد.</Alert>}

      {team.members.length === 0 && (
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm(`تیم خالی «${team.name}» حذف شود؟ این کار برگشت‌ناپذیر است.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="teamId" value={team.id} />
          <button type="submit" className="btn-ghost !py-2 !px-4 text-sm min-h-10 !text-brand-red">حذف تیم خالی</button>
        </form>
      )}
      {deleteState.error && <Alert kind="error">{deleteState.error}</Alert>}
      {(renameState.ok || removeState.ok || deleteState.ok || leaderState.ok || resetState.ok) && <Alert kind="ok">به‌روزرسانی شد.</Alert>}
      <div className="text-[10px] text-brand-slate fa-num">/{team.slug}</div>
    </div>
  );
}
