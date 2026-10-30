"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui";
import { useConfirmSubmit } from "@/components/ConfirmDialog";
import { Avatar } from "@/components/Avatar";
import { fa } from "@/lib/persian";
import { ROLES, type RoleKey } from "@/lib/constants";
import {
  renameTeamAction,
  removeMemberAction,
  deleteTeamAction,
  moveMemberAction,
  setCheatPenaltyAction,
  type TeamsActionState,
} from "./actions";

/** ظرفیت هر تیم (همان TEAM_FULL در lib/team؛ آن ماژول سروری است) */
const TEAM_CAPACITY = 3;

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
  const confirmSubmit = useConfirmSubmit();
  return (
    <>
      {otherTeams.length > 0 && (
        <form
          action={moveAction}
          className={menu ? "space-y-1.5" : "flex items-center gap-2"}
          onSubmit={(e) => {
            const select = e.currentTarget.elements.namedItem("targetTeamId") as HTMLSelectElement | null;
            const target = select?.selectedOptions[0]?.textContent ?? "";
            confirmSubmit(e, `${member.nickname} از «${teamName}» به «${target}» منتقل شود؟`);
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
          confirmSubmit(e, { title: `${member.nickname} از تیم «${teamName}» حذف شود؟`, body: "او بی‌تیم می‌شود.", confirmLabel: "حذف", destructive: true });
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
  /** شرکت فردی: تیم یک‌نفره‌ای که عضو تازه نمی‌پذیرد */
  solo: boolean;
  members: Member[];
  cheatPenalty: number;
  cheatNote: string;
  /** وضعیت ایده و محصول در هر محوری که تیم وارد شده است */
  entries: { trackId: string; trackName: string; ideaSubmitted: boolean; productSubmitted: boolean }[];
};

/** فرم کسر امتیاز تقلب: عدد صحیح ≥ ۰ و دلیلی که به تیم نشان داده می‌شود */
function CheatPenaltyForm({ team }: { team: TeamRowData }) {
  const [state, action, pending] = useActionState<TeamsActionState, FormData>(setCheatPenaltyAction, {});
  const confirmSubmit = useConfirmSubmit();
  return (
    <details className="rounded-2xl border border-brand-mist px-3 py-2" open={team.cheatPenalty > 0 || undefined}>
      <summary className="cursor-pointer text-sm font-bold text-brand-navy min-h-8 flex items-center gap-2">
        کسر امتیاز تقلب
        {team.cheatPenalty > 0 ? (
          <span className="chip-red fa-num">−{fa(team.cheatPenalty)} امتیاز</span>
        ) : (
          <span className="text-xs font-normal text-brand-slate">ندارد</span>
        )}
      </summary>
      <form
        action={action}
        className="mt-2 space-y-2"
        onSubmit={(e) => {
          const n = Number(new FormData(e.currentTarget).get("cheatPenalty") || 0);
          if (n !== team.cheatPenalty) confirmSubmit(e, `کسر امتیاز «${team.name}» به ${fa(n)} امتیاز تغییر کند؟`);
        }}
      >
        <input type="hidden" name="teamId" value={team.id} />
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-28">
            <label className="label" htmlFor={`cheat-${team.id}`}>امتیاز کسرشده</label>
            <input
              id={`cheat-${team.id}`}
              name="cheatPenalty"
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              step={1}
              defaultValue={team.cheatPenalty}
              className="input !py-2 !px-3 w-full fa-num"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="label" htmlFor={`cheat-note-${team.id}`}>دلیل (برای تیم نمایش داده می‌شود)</label>
            <input
              id={`cheat-note-${team.id}`}
              name="cheatNote"
              maxLength={300}
              defaultValue={team.cheatNote}
              className="input !py-2 !px-3 w-full"
            />
          </div>
          <button type="submit" disabled={pending} className="btn-ghost !py-2 !px-4 text-sm min-h-10">
            {pending ? "…" : "ثبت"}
          </button>
        </div>
        <p className="text-xs text-brand-slate">از امتیاز کل (از ۱۰۰۰) کم می‌شود. صفر یعنی بدون کسر.</p>
        {state.error && <Alert kind="error">{state.error}</Alert>}
        {state.ok && <span className="text-emerald-600 text-xs font-bold" role="status">ذخیره شد</span>}
      </form>
    </details>
  );
}

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
  const confirmSubmit = useConfirmSubmit();
  const otherTeams = allTeams.filter((t) => t.id !== team.id);
  const memberCount = team.members.length;
  // پوشش مهارت‌ها فقط اطلاع است؛ شرط شرکت در بازی نیست.
  const skills = new Set(team.members.map((m) => m.role));

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
              <div className="text-xs text-brand-slate fa-num">
                {fa(memberCount)} از {fa(TEAM_CAPACITY)} نفر
                {memberCount > 0 && (
                  <span title="مهارت‌های تیم (فقط برای اطلاع)">
                    {" · مهارت‌ها: "}
                    {(Object.keys(ROLES) as RoleKey[]).map((r) => (
                      <span key={r} className={skills.has(r) ? "" : "opacity-30"} aria-label={`${ROLES[r].label}${skills.has(r) ? "" : " (ندارد)"}`}>
                        {ROLES[r].emoji}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {team.solo && <span className="chip chip-gold">👤 شرکت فردی</span>}
          {team.cheatPenalty > 0 && <span className="chip chip-red fa-num">−{fa(team.cheatPenalty)} تقلب</span>}
          {team.entries.length === 0 && <span className="chip chip-navy">بدون ایده و محصول</span>}
          {team.entries.map((e) => (
            <span key={e.trackId} className={`chip ${e.productSubmitted ? "chip-ok" : e.ideaSubmitted ? "chip-cyan" : "chip-navy"}`}>
              {e.trackName}: {e.productSubmitted ? "محصول ثبت شد" : e.ideaSubmitted ? "ایده ثبت شد" : "پیش‌نویس"}
            </span>
          ))}
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
                {m.nickname}
                {m.role in ROLES && (
                  <span className="ms-1.5 text-xs font-normal text-brand-slate">
                    {ROLES[m.role as RoleKey].emoji} {ROLES[m.role as RoleKey].label}
                  </span>
                )}
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
      <CheatPenaltyForm team={team} />
      {removeState.error && <Alert kind="error">{removeState.error}</Alert>}
      {moveState.error && <Alert kind="error">{moveState.error}</Alert>}
      {moveState.ok && <Alert kind="ok">کاربر منتقل شد.</Alert>}

      {team.members.length === 0 && (
        <form
          action={deleteAction}
          onSubmit={(e) => {
            confirmSubmit(e, { title: `تیم خالی «${team.name}» حذف شود؟`, body: "این کار برگشت‌ناپذیر است.", confirmLabel: "حذف", destructive: true });
          }}
        >
          <input type="hidden" name="teamId" value={team.id} />
          <button type="submit" className="btn-ghost !py-2 !px-4 text-sm min-h-10 !text-brand-red">حذف تیم خالی</button>
        </form>
      )}
      {deleteState.error && <Alert kind="error">{deleteState.error}</Alert>}
      {(renameState.ok || removeState.ok || deleteState.ok) && <Alert kind="ok">به‌روزرسانی شد.</Alert>}
      <div className="text-xs text-brand-slate fa-num">/{team.slug}</div>
    </div>
  );
}
