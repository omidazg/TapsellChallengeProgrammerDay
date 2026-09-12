"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Alert } from "@/components/ui";
import { ROLES, POWERS, type RoleKey, type PowerKey } from "@/lib/constants";
import { fa, jdatetime } from "@/lib/persian";
import type { RoleCoverage, TeamWithMembers } from "@/lib/team";
import { inviteAction, leaveTeamAction } from "./actions";

const TEAM_FULL = 3;

export function TeamPanel({
  team,
  coverage,
  currentUserId,
  registrationOpen,
}: {
  team: TeamWithMembers;
  coverage: RoleCoverage[];
  currentUserId: string;
  registrationOpen: boolean;
}) {
  const full = team.members.length >= TEAM_FULL;

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
          {registrationOpen && <LeaveButton />}
        </div>

        <div>
          <h3 className="mb-3 text-lg font-black text-brand-navy">اعضای تیم ({fa(team.members.length)} از {fa(TEAM_FULL)})</h3>
          <div className="grid gap-3 sm:grid-cols-3 stagger">
            {team.members.map((m) => {
              const role = m.role as RoleKey;
              const power = m.power as PowerKey;
              return (
                <div key={m.id} className={`card p-4 ${m.id === currentUserId ? "ring-2 ring-brand-cyan" : ""}`}>
                  <Avatar seed={m.avatarSeed || m.id} size={56} />
                  <div className="mt-2 font-black text-brand-navy break-words">{m.nickname}</div>
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

        {registrationOpen && (
          <InviteForm full={full} pendingInvites={team.invites} />
        )}
      </div>

      <div className="space-y-4">
        <div className="card p-5 anim-rise">
          <h3 className="mb-3 font-black text-brand-navy">پیشرفت تیم</h3>
          <ChecklistItem done={!!team.idea?.submittedAt} label="ایده ثبت شده؟" href="/idea" />
          <ChecklistItem done={!!team.product?.submittedAt} label="محصول ثبت شده؟" href="/build" />
        </div>
      </div>
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

function LeaveButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function leave() {
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

function InviteForm({ full, pendingInvites }: { full: boolean; pendingInvites: TeamWithMembers["invites"] }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    startTransition(async () => {
      const res = await inviteAction({ email });
      if (res.error) setError(res.error);
      else {
        setOk(true);
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
            <div className="w-full">
              <Alert kind="error">{error}</Alert>
            </div>
          )}
          {ok && (
            <div className="w-full">
              <Alert kind="ok">دعوت‌نامه ارسال شد.</Alert>
            </div>
          )}
          <input
            type="email"
            dir="ltr"
            required
            className="input flex-1 min-w-0 sm:min-w-[220px]"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
            {pending ? "در حال ارسال…" : "دعوت کن"}
          </button>
        </form>
      )}
      {pendingInvites.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {pendingInvites.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-1 rounded-xl bg-brand-ice px-3 py-2 text-xs">
              <span dir="ltr" className="min-w-0 break-all text-brand-navy">{inv.email}</span>
              <span className="text-brand-slate shrink-0">{jdatetime(inv.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
