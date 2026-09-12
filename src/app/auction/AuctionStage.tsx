"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Avatar } from "@/components/Avatar";
import { Alert, Coin } from "@/components/ui";
import { fa, coins } from "@/lib/persian";
import { placeBidAction, secondWindAction } from "./actions";
import type { AuctionState } from "@/lib/auction";

function mmss(ms: number) {
  if (ms <= 0) return "۰۰:۰۰";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return fa(`${m}:${s}`);
}

export function AuctionStage({
  initialId,
  currentUser,
}: {
  initialId: string | null;
  currentUser: { id: string; nickname: string; buyWallet: number; power: string; powerUsed: boolean };
}) {
  const [auctionId, setAuctionId] = useState(initialId);
  const [state, setState] = useState<AuctionState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [outbid, setOutbid] = useState(false);
  const [amount, setAmount] = useState<number | "">("");
  const wasHighest = useRef(false);
  const [pending, startTransition] = useTransition();

  // پیدا کردن حراج زندهٔ فعلی
  useEffect(() => {
    let stop = false;
    async function pollLive() {
      try {
        const res = await fetch("/api/auction/live", { cache: "no-store" });
        const data = await res.json();
        if (!stop && data.id !== auctionId) setAuctionId(data.id);
      } catch {
        /* نادیده گرفتن خطای شبکه */
      }
    }
    pollLive();
    const t = setInterval(pollLive, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [auctionId]);

  // وضعیت حراج فعلی
  useEffect(() => {
    if (!auctionId) return;
    let stop = false;
    async function pollState() {
      try {
        const res = await fetch(`/api/auction/${auctionId}/state`, { cache: "no-store" });
        if (!res.ok) return;
        const data: AuctionState = await res.json();
        if (stop) return;
        const iWasHighest = wasHighest.current;
        const iAmHighestNow = data.highest?.nickname === currentUser.nickname;
        if (iWasHighest && !iAmHighestNow && data.highest) setOutbid(true);
        wasHighest.current = iAmHighestNow;
        setState(data);
        setNow(Date.now());
      } catch {
        /* نادیده گرفتن خطای شبکه */
      }
    }
    pollState();
    const t = setInterval(pollState, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [auctionId, currentUser.nickname]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!auctionId || !state) {
    return (
      <div className="card p-10 text-center anim-pop">
        <div className="text-5xl mb-3">⏳</div>
        <h3 className="text-xl font-black">فعلاً حراجی زنده نیست</h3>
        <p className="mt-2 text-brand-slate">منتظر شروع حراج بعدی توسط برگزارکننده باش.</p>
      </div>
    );
  }

  const endsAtMs = state.endsAt ? new Date(state.endsAt).getTime() : null;
  const remaining = endsAtMs ? endsAtMs - now : 0;
  const isLive = state.status === "LIVE";
  const urgent = isLive && remaining <= 30_000;

  function quickAmounts() {
    const base = state!.nextMin;
    return [base + 2, base + 5, base + 10];
  }

  async function submitBid(value: number) {
    setError(null);
    startTransition(async () => {
      const res = await placeBidAction(auctionId!, value);
      if (res?.error) setError(res.error);
      else {
        setOutbid(false);
        setAmount("");
      }
    });
  }

  async function claimSecondWind() {
    setError(null);
    startTransition(async () => {
      const res = await secondWindAction(auctionId!);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
      <div className="card overflow-hidden anim-rise">
        <div className="relative h-56 sm:h-72">
          <Image src={state.product.cover} alt={state.product.specialName} fill className="object-cover" unoptimized />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/80 via-brand-navy/10 to-transparent" />
          <div className="absolute bottom-4 right-4 left-4 text-white">
            <span className="chip-cyan !bg-white/20 !text-white">{state.product.teamName}</span>
            <h2 className="mt-2 text-2xl sm:text-3xl font-black">{state.product.specialName}</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-brand-slate text-sm">{state.product.specialDesc}</p>

          <div className="flex items-center justify-between gap-4">
            <div
              className={`fa-num text-4xl sm:text-5xl font-black tabular-nums rounded-2xl px-5 py-3 ${
                urgent ? "text-white bg-brand-red pulse-ring" : "text-brand-navy bg-brand-ice"
              }`}
            >
              {isLive ? mmss(remaining) : state.status === "SCHEDULED" ? "در صف" : "پایان‌یافته"}
            </div>
            {isLive && (
              <div className="text-left">
                <div className="text-xs font-bold text-brand-slate">بالاترین پیشنهاد</div>
                {state.highest ? (
                  <div className="flex items-center gap-2 mt-1 anim-pop" key={state.highest.amount}>
                    <Avatar seed={state.highest.avatarSeed} size={32} />
                    <div>
                      <div className="font-black text-brand-navy">{state.highest.nickname}</div>
                      <Coin n={state.highest.amount} />
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 font-bold text-brand-slate">هنوز پیشنهادی ثبت نشده — شروع از {coins(state.nextMin)}</div>
                )}
              </div>
            )}
          </div>

          {outbid && (
            <div className="anim-pop">
              <Alert kind="error">روی شما پیشنهاد بالاتر داده شد!</Alert>
            </div>
          )}
          {error && <Alert kind="error">{error}</Alert>}

          {isLive && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {quickAmounts().map((v, i) => (
                  <button key={v} disabled={pending || v > currentUser.buyWallet} onClick={() => submitBid(v)} className="btn-cyan !px-4 !py-2 disabled:opacity-40">
                    +{fa([2, 5, 10][i])} ({fa(v)})
                  </button>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="input !w-32"
                    placeholder={fa(state.nextMin)}
                    value={amount}
                    min={state.nextMin}
                    onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                  <button
                    disabled={pending || amount === "" || Number(amount) < state.nextMin || Number(amount) > currentUser.buyWallet}
                    onClick={() => submitBid(Number(amount))}
                    className="btn-primary !px-5 !py-2 disabled:opacity-40"
                  >
                    ثبت پیشنهاد
                  </button>
                </div>
              </div>
              <div className="text-xs text-brand-slate">حداقل پیشنهاد بعدی: {coins(state.nextMin)} · موجودی کیف خرید تو: {coins(currentUser.buyWallet)}</div>

              {currentUser.power === "SECOND_WIND" && !currentUser.powerUsed && (
                <button onClick={claimSecondWind} disabled={pending} className="btn-navy !px-4 !py-2">
                  ⏱️ نفس دوم (دو دقیقه تمدید)
                </button>
              )}
            </div>
          )}

          <div>
            <div className="text-xs font-bold text-brand-slate mb-2">تاریخچهٔ پیشنهادها</div>
            {state.bids.length === 0 ? (
              <div className="text-sm text-brand-slate">هنوز پیشنهادی ثبت نشده.</div>
            ) : (
              <ul className="space-y-1.5 stagger">
                {state.bids.map((b, i) => (
                  <li key={`${b.createdAt}-${i}`} className={`flex items-center justify-between rounded-xl bg-brand-ice px-3 py-2 text-sm ${i === 0 ? "anim-pop" : ""}`}>
                    <span className="flex items-center gap-2 font-bold text-brand-navy">
                      <Avatar seed={b.avatarSeed} size={22} />
                      {b.nickname}
                    </span>
                    <span className="fa-num font-black">{coins(b.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="card p-5 h-fit">
        <div className="text-sm font-black text-brand-navy mb-2">کیف خرید تو</div>
        <Coin n={currentUser.buyWallet} />
        <div className="mt-4 text-xs text-brand-slate">
          {state.extensions > 0 && <>این حراج {fa(state.extensions)} بار تمدید شده است.</>}
        </div>
      </div>
    </div>
  );
}
