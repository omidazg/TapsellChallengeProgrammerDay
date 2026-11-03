"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { fa } from "@/lib/persian";
import { voteAction } from "./actions";

/**
 * دکمهٔ رأی ویترین. mode: guest (لینک ورود)، own (محصول تیم خودت)، closed (رأی‌گیری بسته)، vote (قابل رأی)
 */
export function VoteButton({
  productId,
  slug,
  votes,
  voted,
  mode,
}: {
  productId: string;
  slug: string;
  votes: number;
  voted: boolean;
  mode: "vote" | "guest" | "own" | "closed";
}) {
  const [state, setState] = useState({ votes, voted });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const count = (
    <span className="text-2xl font-black fa-num leading-none">{fa(state.votes)}</span>
  );

  if (mode === "guest") {
    return (
      <Link href={`/login?next=${encodeURIComponent(`/showcase/${slug}`)}`} className="btn-ghost flex-col !py-2 !px-4 min-w-20" title="برای رأی دادن وارد شو">
        <span aria-hidden>▲</span>
        {count}
        <span className="text-xs">ورود و رأی</span>
      </Link>
    );
  }

  const disabled = mode !== "vote" || pending;
  return (
    <div className="space-y-1 text-center">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={state.voted}
        title={mode === "own" ? "به محصول تیم خودت نمی‌توانی رأی بدهی" : mode === "closed" ? "رأی‌گیری فعلاً بسته است" : undefined}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await voteAction(productId, slug);
            if (res.error) setError(res.error);
            else setState((s) => ({ voted: !!res.voted, votes: s.votes + (res.voted ? 1 : -1) }));
          });
        }}
        className={`${state.voted ? "btn-primary" : "btn-ghost"} flex-col !py-2 !px-4 min-w-20`}
      >
        <span aria-hidden>▲</span>
        {count}
        <span className="text-xs">{state.voted ? "رأی دادی" : "رأی"}</span>
      </button>
      {error && <p className="text-xs text-brand-red" role="alert">{error}</p>}
    </div>
  );
}
