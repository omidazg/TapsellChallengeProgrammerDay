"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Alert } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { castLeaderVoteAction, withdrawLeaderVoteAction } from "./actions";

export type LeaderCardMember = { id: string; nickname: string; avatarSeed: string };

export type LeaderCardState = {
  leaderId: string | null;
  leaderElectedAt: string | null;
  memberCount: number;
  threshold: number;
  votingOpen: boolean;
  votes: Record<string, string>;
  tally: Record<string, number>;
};

/** سرپرست تیم و رأی‌گیری شفاف: همه می‌بینند چه کسی به چه کسی رأی داده */
export function LeaderCard({
  state,
  members,
  currentUserId,
}: {
  state: LeaderCardState;
  members: LeaderCardMember[];
  currentUserId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const byId = new Map(members.map((m) => [m.id, m]));
  const leader = state.leaderId ? byId.get(state.leaderId) : null;
  const myVote = state.votes[currentUserId] ?? null;

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="card p-5 anim-rise space-y-4 scroll-mt-24" id="leader">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-black text-brand-navy">👑 سرپرست تیم</h3>
        <Link href="/guide#leader" className="text-xs font-bold text-brand-cyan-dark underline">
          قواعد سرپرستی
        </Link>
      </div>

      {leader ? (
        <div className="flex items-center gap-3">
          <Avatar seed={leader.avatarSeed || leader.id} size={48} />
          <div>
            <div className="font-black text-brand-navy">
              {leader.nickname}
              {leader.id === currentUserId && <span className="chip-ok mr-2 text-[11px]">خودت</span>}
            </div>
            {state.leaderElectedAt && (
              <div className="text-xs text-brand-slate fa-num">از {jdatetime(new Date(state.leaderElectedAt))}</div>
            )}
          </div>
        </div>
      ) : state.memberCount <= 1 ? (
        <p className="text-sm leading-7 text-brand-slate">
          تا وقتی تنها عضو تیمی، خودت همه‌چیز را مدیریت می‌کنی. با آمدن عضو دوم، رأی‌گیری سرپرست باز می‌شود.
        </p>
      ) : (
        <p className="text-sm leading-7 text-brand-slate">
          هنوز کسی سرپرست نشده. هر کس <b className="fa-num text-brand-navy">{fa(state.threshold)}</b> رأی از{" "}
          <b className="fa-num text-brand-navy">{fa(state.memberCount)}</b> بگیرد خودکار سرپرست می‌شود. تا آن لحظه می‌توانی رأیت را
          عوض کنی یا پس بگیری.
        </p>
      )}

      {leader && (
        <p className="text-xs leading-6 text-brand-slate">
          ثبت و ویرایش ایده، محصول و پیشنهاد جایگاه تبلیغاتی با سرپرست است؛ بقیهٔ اعضا همه‌چیز را می‌بینند. کارهای شخصی (سرمایه‌گذاری،
          خرید، حراج و قدرت) مال خود هر نفر است.
        </p>
      )}

      {state.votingOpen && (
        <ul className="space-y-2">
          {members.map((m) => {
            const count = state.tally[m.id] ?? 0;
            const voters = Object.entries(state.votes)
              .filter(([, c]) => c === m.id)
              .map(([v]) => byId.get(v)?.nickname ?? "—");
            const mine = myVote === m.id;
            return (
              <li key={m.id} className={`rounded-xl border p-3 ${mine ? "border-brand-cyan bg-brand-ice" : "border-slate-200"}`}>
                <div className="flex items-center gap-2">
                  <Avatar seed={m.avatarSeed || m.id} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-brand-navy break-words">
                      {m.nickname}
                      {m.id === currentUserId && <span className="text-xs text-brand-slate"> (خودت)</span>}
                    </div>
                    <div className="text-[11px] text-brand-slate fa-num">
                      {fa(count)} از {fa(state.threshold)} رأی لازم
                      {voters.length > 0 && <> · رأی‌دهنده: {voters.join("، ")}</>}
                    </div>
                  </div>
                  {mine ? (
                    <span className="chip-cyan text-[11px]">رأی تو</span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => castLeaderVoteAction(m.id))}
                      className="btn-cyan !px-2.5 !py-1.5 !text-xs disabled:opacity-40"
                      aria-label={`رأی به ${m.nickname} برای سرپرستی`}
                    >
                      {myVote ? "تغییر رأی" : "رأی بده"}
                    </button>
                  )}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-cyan transition-all"
                    style={{ width: `${Math.min(100, (count / state.threshold) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {state.votingOpen && myVote && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(withdrawLeaderVoteAction)}
          className="btn-ghost w-full !text-xs"
        >
          پس گرفتن رأی من
        </button>
      )}

      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}
