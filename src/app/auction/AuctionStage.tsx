"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Alert, Coin } from "@/components/ui";
import { fa, coins } from "@/lib/persian";
import { placeBidAction, secondWindAction } from "./actions";
import type { AuctionState } from "@/lib/auction";

const QUICK_STEPS = [0, 2, 5] as const;

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
  currentUser: { id: string; nickname: string; teamId: string | null; buyWallet: number; power: string; powerUsed: boolean };
}) {
  const [auctionId, setAuctionId] = useState(initialId);
  const [state, setState] = useState<AuctionState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [outbid, setOutbid] = useState(false);
  const [amount, setAmount] = useState<number | "">("");
  const wasHighest = useRef(false);
  const lastStatus = useRef<string | null>(null);
  const lastFetchedId = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  /** یک بار وضعیت حراج جاری را می‌گیرد؛ برای polling و برای تازه‌سازی بلافاصله پس از پیشنهاد. */
  const fetchState = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/auction/${id}/state`, { cache: "no-store" });
        if (!res.ok) return null;
        const data: AuctionState = await res.json();

        // اولین واکشیِ یک حراج تازه: هشدارها و ورودی مبلغ پاک شوند.
        if (lastFetchedId.current !== id) {
          lastFetchedId.current = id;
          setOutbid(false);
          setAmount("");
          setError(null);
        }

        // «پیشنهادت شکسته شد» فقط وقتی که پیش‌تر بالاترین بودم و حالا نیستم.
        const iAmHighestNow = data.highest?.userId === currentUser.id;
        if (wasHighest.current && !iAmHighestNow && data.highest) setOutbid(true);
        if (iAmHighestNow) setOutbid(false);
        wasHighest.current = iAmHighestNow;

        // با پایان یافتن حراج، کیف خرید سرور تغییر کرده است؛ صفحه را تازه کن.
        if (lastStatus.current === "LIVE" && data.status === "ENDED") router.refresh();
        lastStatus.current = data.status;

        setState(data);
        setNow(Date.now());
        return data;
      } catch {
        /* نادیده گرفتن خطای شبکه */
        return null;
      }
    },
    [currentUser.id, router]
  );

  // پیدا کردن حراج زندهٔ فعلی
  useEffect(() => {
    let stop = false;
    async function pollLive() {
      try {
        const res = await fetch("/api/auction/live", { cache: "no-store" });
        const data: { id: string | null } = await res.json();
        if (stop) return;
        setAuctionId((prev) => (prev === data.id ? prev : data.id));
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
  }, []);

  // وضعیت حراج فعلی
  useEffect(() => {
    if (!auctionId) return;
    // با عوض شدن حراج، حافظهٔ «بالاترین بودم» باید پاک شود (فقط ref — بدون setState در افکت).
    wasHighest.current = false;
    lastStatus.current = null;

    let stop = false;
    const run = () => {
      if (!stop) void fetchState(auctionId);
    };
    run();
    const t = setInterval(run, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [auctionId, fetchState]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const submitBid = useCallback(
    (value: number) => {
      if (!auctionId) return;
      setError(null);
      startTransition(async () => {
        const res = await placeBidAction(auctionId, value);
        if ("error" in res && res.error) setError(res.error);
        else {
          setOutbid(false);
          setAmount("");
        }
        // چه موفق چه ناموفق: بلافاصله وضعیت تازه را بگیر.
        await fetchState(auctionId);
      });
    },
    [auctionId, fetchState]
  );

  const claimSecondWind = useCallback(() => {
    if (!auctionId) return;
    setError(null);
    startTransition(async () => {
      const res = await secondWindAction(auctionId);
      if ("error" in res && res.error) setError(res.error);
      else router.refresh();
      await fetchState(auctionId);
    });
  }, [auctionId, fetchState, router]);

  // وضعیتِ مانده از حراج قبلی نباید نمایش داده شود.
  if (!auctionId || !state || state.id !== auctionId) {
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
  const isMyTeam = !!currentUser.teamId && state.product.teamId === currentUser.teamId;
  const quickAmounts = QUICK_STEPS.map((step) => state.nextMin + step);
  const typed = amount === "" ? null : Number(amount);

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
      <div className="card overflow-hidden anim-rise">
        <div className="relative h-56 sm:h-72">
          <Image src={state.product.cover} alt={state.product.specialName} fill className="object-cover" unoptimized />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/80 via-brand-navy/10 to-transparent" />
          <div className="absolute bottom-4 right-4 left-4 text-white">
            <span className="chip-cyan !bg-white/20 !text-white">{state.product.teamName}</span>
            <h2 className="mt-2 text-2xl sm:text-3xl font-black break-words">{state.product.specialName}</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-brand-slate text-sm">{state.product.specialDesc}</p>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div
              className={`fa-num text-3xl sm:text-5xl font-black tabular-nums rounded-2xl px-4 sm:px-5 py-3 ${
                urgent ? "text-white bg-brand-red pulse-ring" : "text-brand-navy bg-brand-ice"
              }`}
            >
              {isLive ? mmss(remaining) : state.status === "SCHEDULED" ? "در صف" : "پایان‌یافته"}
            </div>
            {isLive ? (
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
            ) : state.status === "ENDED" ? (
              <div className="text-left">
                <div className="text-xs font-bold text-brand-slate">برنده</div>
                {state.winnerNickname ? (
                  <div className="mt-1">
                    <div className="font-black text-brand-navy">{state.winnerNickname}</div>
                    <Coin n={state.finalPrice ?? 0} />
                  </div>
                ) : (
                  <div className="mt-1 font-bold text-brand-slate">بدون برنده</div>
                )}
              </div>
            ) : null}
          </div>

          {outbid && (
            <div className="anim-pop">
              <Alert kind="error">روی شما پیشنهاد بالاتر داده شد!</Alert>
            </div>
          )}
          {error && <Alert kind="error">{error}</Alert>}

          {isLive && isMyTeam && <Alert kind="info">این نسخهٔ ویژهٔ تیم خودت است؛ نمی‌توانی روی آن پیشنهاد بدهی.</Alert>}

          {isLive && !isMyTeam && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
                {quickAmounts.map((v, i) => (
                  <button
                    key={v}
                    disabled={pending || v > currentUser.buyWallet}
                    onClick={() => submitBid(v)}
                    className="btn-cyan !px-2 sm:!px-4 !py-3 sm:!py-2 text-sm sm:text-base disabled:opacity-40"
                  >
                    {i === 0 ? "حداقل" : `+${fa(QUICK_STEPS[i])}`} ({fa(v)})
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="input flex-1 min-w-0 sm:!w-32 sm:flex-none"
                  placeholder={fa(state.nextMin)}
                  value={amount}
                  min={state.nextMin}
                  step={1}
                  onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                />
                <button
                  disabled={pending || typed === null || typed < state.nextMin || typed > currentUser.buyWallet}
                  onClick={() => typed !== null && submitBid(typed)}
                  className="btn-primary !px-5 !py-3 sm:!py-2 shrink-0 disabled:opacity-40"
                >
                  ثبت پیشنهاد
                </button>
              </div>
              <div className="text-xs text-brand-slate">حداقل پیشنهاد بعدی: {coins(state.nextMin)} · موجودی کیف خرید تو: {coins(currentUser.buyWallet)}</div>

              {currentUser.power === "SECOND_WIND" && !currentUser.powerUsed && (
                <button onClick={claimSecondWind} disabled={pending} className="btn-navy w-full sm:w-auto !px-4 !py-2">
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
