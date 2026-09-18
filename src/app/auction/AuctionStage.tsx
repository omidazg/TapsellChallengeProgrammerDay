"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Alert, Coin } from "@/components/ui";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { usePolling } from "@/hooks/usePolling";
import { fa, coins } from "@/lib/persian";
import { placeBidAction, secondWindAction } from "./actions";
import type { AuctionState } from "@/lib/auction";

const QUICK_STEPS = [0, 2, 5] as const;
const FLASH_TITLE = "🔔 پیشنهادت شکسته شد";
const FLASH_MS = 5000;
const FLASH_INTERVAL_MS = 900;
/** polling پشتیبان (وقتی SSE در دسترس نیست). در تب پنهان کُندتر، نه متوقف، تا هشدار «شکسته شدی» از دست نرود. */
const POLL_MS = 2000;
const POLL_HIDDEN_MS = 10_000;
/** پس از این تعداد خطای پیاپی EventSource به polling برمی‌گردیم. */
const SSE_MAX_ERRORS = 3;
/** در حالت polling، پس از این مدت دوباره SSE امتحان می‌شود. */
const SSE_RETRY_MS = 60_000;
/** حداقل فاصلهٔ اعلان‌های صفحه‌خوان در ناحیهٔ aria-live. */
const ANNOUNCE_MIN_GAP_MS = 3000;

type StreamPayload = { id: string | null; state: AuctionState | null };

/** بوق کوتاه با WebAudio، بدون فایل صوتی. */
function playBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* نادیده گرفتن خطای صوتی (مثلاً مرورگرهای بدون تعامل کاربر) */
  }
}

function mmss(ms: number) {
  if (ms <= 0) return "۰۰:۰۰";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return fa(`${m}:${s}`);
}

/** برای صفحه‌خوان: فقط در آستانه‌ها عوض می‌شود، نه هر ثانیه. */
function remainingBucket(ms: number): string {
  if (ms <= 0) return "";
  if (ms <= 10_000) return "کمتر از ۱۰ ثانیه مانده";
  if (ms <= 30_000) return "کمتر از ۳۰ ثانیه مانده";
  if (ms <= 60_000) return "کمتر از یک دقیقه مانده";
  return "";
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
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const flashTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalTitle = useRef<string>("");
  // "sse": جریان زنده؛ "poll": پشتیبان polling پس از خطاهای پیاپی یا نبود EventSource.
  const [mode, setMode] = useState<"sse" | "poll">(() => (typeof EventSource === "undefined" ? "poll" : "sse"));
  // شمار خطاهای پیاپی اتصال (SSE یا polling)؛ از ۲ به بالا نوار «اتصال قطع شد» نمایش داده می‌شود.
  const [failures, setFailures] = useState(0);
  const [announced, setAnnounced] = useState("");
  const lastAnnounceAt = useRef(0);

  useEffect(() => {
    originalTitle.current = document.title;
    return () => {
      if (flashTimer.current) clearInterval(flashTimer.current);
      if (flashStop.current) clearTimeout(flashStop.current);
      document.title = originalTitle.current;
    };
  }, []);

  const requestNotifPermission = useCallback(() => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((p) => setNotifPermission(p));
  }, []);

  /** واکنش وقتی کاربر «شکسته» می‌شود: بوق، چشمک عنوان، و (در صورت اجازه) اعلان مرورگر. */
  const triggerOutbidAlert = useCallback(() => {
    playBeep();

    if (flashTimer.current) clearInterval(flashTimer.current);
    if (flashStop.current) clearTimeout(flashStop.current);
    let flashed = false;
    flashTimer.current = setInterval(() => {
      document.title = flashed ? originalTitle.current : FLASH_TITLE;
      flashed = !flashed;
    }, FLASH_INTERVAL_MS);
    flashStop.current = setTimeout(() => {
      if (flashTimer.current) clearInterval(flashTimer.current);
      document.title = originalTitle.current;
    }, FLASH_MS);

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("پیشنهادت شکسته شد", { body: "یک پیشنهاد بالاتر روی این حراج ثبت شد.", icon: "/brand/favicon.svg" });
      } catch {
        /* نادیده گرفتن خطای اعلان مرورگر */
      }
    }
  }, []);

  /** پردازش یک وضعیت تازه (از SSE یا polling): هشدار شکسته‌شدن، رفرش پس از پایان، و ذخیره. */
  const applyState = useCallback(
    (data: AuctionState) => {
      // اولین وضعیتِ یک حراج تازه: هشدارها، ورودی مبلغ و حافظهٔ «بالاترین بودم» پاک شوند.
      if (lastFetchedId.current !== data.id) {
        lastFetchedId.current = data.id;
        wasHighest.current = false;
        lastStatus.current = null;
        setOutbid(false);
        setAmount("");
        setError(null);
      }

      // «پیشنهادت شکسته شد» فقط وقتی که پیش‌تر بالاترین بودم و حالا نیستم.
      // (این مقایسه در کلاینت انجام می‌شود؛ سرور هیچ دادهٔ مخصوص کاربر پخش نمی‌کند.)
      const iAmHighestNow = data.highest?.userId === currentUser.id;
      if (wasHighest.current && !iAmHighestNow && data.highest) {
        setOutbid(true);
        triggerOutbidAlert();
      }
      if (iAmHighestNow) setOutbid(false);
      wasHighest.current = iAmHighestNow;

      // با پایان یافتن حراج، کیف خرید سرور تغییر کرده است؛ صفحه را تازه کن.
      if (lastStatus.current === "LIVE" && data.status === "ENDED") router.refresh();
      lastStatus.current = data.status;

      setState(data);
      setNow(Date.now());
    },
    [currentUser.id, router, triggerOutbidAlert]
  );

  /** یک بار وضعیت یک حراج را می‌گیرد؛ برای polling پشتیبان و تازه‌سازی بلافاصله پس از پیشنهاد. */
  const fetchState = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/auction/${id}/state`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data: AuctionState = await res.json();
      applyState(data);
      return data;
    },
    [applyState]
  );

  // جریان زنده (SSE): وضعیت عمومی حراج فقط هنگام تغییر از سرور می‌رسد.
  useEffect(() => {
    if (mode !== "sse") return;
    const es = new EventSource("/api/auction/stream");
    let errors = 0;
    const onOpen = () => {
      errors = 0;
      setFailures(0);
    };
    const onState = (ev: MessageEvent<string>) => {
      errors = 0;
      setFailures(0);
      try {
        const payload = JSON.parse(ev.data) as StreamPayload;
        setAuctionId((prev) => (prev === payload.id ? prev : payload.id));
        if (payload.state) applyState(payload.state);
      } catch {
        /* پیام خراب؛ پیام بعدی جایگزین می‌شود */
      }
    };
    const onError = () => {
      // EventSource خودش دوباره وصل می‌شود؛ پس از چند خطای پیاپی (یا بسته‌شدن قطعی، مثل 401) به polling برمی‌گردیم.
      errors += 1;
      setFailures(errors);
      if (errors >= SSE_MAX_ERRORS || es.readyState === EventSource.CLOSED) {
        es.close();
        setMode("poll");
      }
    };
    es.addEventListener("open", onOpen);
    es.addEventListener("state", onState);
    es.addEventListener("error", onError);
    return () => {
      es.removeEventListener("open", onOpen);
      es.removeEventListener("state", onState);
      es.removeEventListener("error", onError);
      es.close();
    };
  }, [mode, applyState]);

  // در حالت polling، پس از مدتی دوباره SSE امتحان شود.
  useEffect(() => {
    if (mode !== "poll" || typeof EventSource === "undefined") return;
    const t = setTimeout(() => setMode("sse"), SSE_RETRY_MS);
    return () => clearTimeout(t);
  }, [mode]);

  // polling پشتیبان (فقط در حالت poll): حراج زندهٔ فعلی و سپس وضعیت آن.
  usePolling(
    async () => {
      try {
        const res = await fetch("/api/auction/live", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data: { id: string | null } = await res.json();
        setAuctionId((prev) => (prev === data.id ? prev : data.id));
        if (data.id) await fetchState(data.id);
        setFailures(0);
      } catch {
        setFailures((n) => n + 1);
      }
    },
    POLL_MS,
    { enabled: mode === "poll", hiddenIntervalMs: POLL_HIDDEN_MS }
  );

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
        // چه موفق چه ناموفق: بلافاصله وضعیت تازه را بگیر (SSE هم تغییر را می‌فرستد).
        await fetchState(auctionId).catch(() => null);
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
      await fetchState(auctionId).catch(() => null);
    });
  }, [auctionId, fetchState, router]);

  // وضعیتِ مانده از حراج قبلی نباید نمایش داده شود.
  const current = auctionId && state && state.id === auctionId ? state : null;

  // متن ناحیهٔ aria-live: فقط با تغییر قیمت/نفر اول/وضعیت یا عبور از آستانه‌های زمانی عوض می‌شود، نه هر ثانیه.
  let liveText = "";
  if (current?.status === "LIVE") {
    const leader = current.highest
      ? `بالاترین پیشنهاد ${coins(current.highest.amount)} از ${current.highest.nickname}${
          current.highest.userId === currentUser.id ? " (خودت)" : ""
        }`
      : `هنوز پیشنهادی ثبت نشده؛ شروع از ${coins(current.nextMin)}`;
    const endsAt = current.endsAt ? new Date(current.endsAt).getTime() : null;
    const bucket = endsAt ? remainingBucket(endsAt - now) : "";
    liveText = bucket ? `${leader}، ${bucket}` : leader;
  } else if (current?.status === "ENDED") {
    liveText = current.winnerNickname
      ? `حراج تمام شد. برنده ${current.winnerNickname} با ${coins(current.finalPrice ?? 0)}`
      : "حراج بدون برنده تمام شد";
  }

  // اعلان‌ها throttle می‌شوند: حداکثر یکی در هر ۳ ثانیه، و همیشه آخرین متن.
  useEffect(() => {
    const wait = Math.max(0, lastAnnounceAt.current + ANNOUNCE_MIN_GAP_MS - Date.now());
    const t = setTimeout(() => {
      lastAnnounceAt.current = Date.now();
      setAnnounced(liveText);
    }, wait);
    return () => clearTimeout(t);
  }, [liveText]);

  const banner = <ConnectionBanner failing={failures >= 2} />;
  const liveRegion = (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announced}
    </div>
  );

  if (!current) {
    return (
      <div className="card p-10 text-center anim-pop">
        {banner}
        {liveRegion}
        <div className="text-5xl mb-3" aria-hidden>
          ⏳
        </div>
        <h3 className="text-xl font-black">فعلاً حراجی زنده نیست</h3>
        <p className="mt-2 text-brand-slate">منتظر شروع حراج بعدی توسط برگزارکننده باش.</p>
      </div>
    );
  }

  const endsAtMs = current.endsAt ? new Date(current.endsAt).getTime() : null;
  const remaining = endsAtMs ? endsAtMs - now : 0;
  const isLive = current.status === "LIVE";
  const urgent = isLive && remaining <= 30_000;
  const isMyTeam = !!currentUser.teamId && current.product.teamId === currentUser.teamId;
  const quickAmounts = QUICK_STEPS.map((step) => current.nextMin + step);
  const typed = amount === "" ? null : Number(amount);
  const canSubmitTyped = !pending && typed !== null && typed >= current.nextMin && typed <= currentUser.buyWallet;

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
      {banner}
      {liveRegion}
      <div className="card overflow-hidden anim-rise">
        <div className="relative h-56 sm:h-72">
          <Image src={current.product.cover} alt={current.product.specialName} fill className="object-cover" unoptimized />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/80 via-brand-navy/10 to-transparent" />
          <div className="absolute bottom-4 right-4 left-4 text-white">
            <span className="chip-cyan !bg-white/20 !text-white">{current.product.teamName}</span>
            <h2 className="mt-2 text-2xl sm:text-3xl font-black break-words">{current.product.specialName}</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-brand-slate text-sm">{current.product.specialDesc}</p>

          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* role=timer به‌طور پیش‌فرض aria-live=off است؛ اعلان‌ها از ناحیهٔ throttle‌شدهٔ بالا می‌آیند. */}
            <div
              role="timer"
              aria-label={isLive ? "زمان باقی‌ماندهٔ حراج" : "وضعیت حراج"}
              className={`fa-num text-3xl sm:text-5xl font-black tabular-nums rounded-2xl px-4 sm:px-5 py-3 ${
                urgent ? "text-white bg-brand-red pulse-ring" : "text-brand-navy bg-brand-ice"
              }`}
            >
              {isLive ? mmss(remaining) : current.status === "SCHEDULED" ? "در صف" : "پایان‌یافته"}
            </div>
            {isLive ? (
              <div className="text-left">
                <div className="text-xs font-bold text-brand-slate">بالاترین پیشنهاد</div>
                {current.highest ? (
                  <div className="flex items-center gap-2 mt-1 anim-pop" key={current.highest.amount}>
                    <Avatar seed={current.highest.avatarSeed} size={32} />
                    <div>
                      <div className="font-black text-brand-navy">{current.highest.nickname}</div>
                      <Coin n={current.highest.amount} />
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 font-bold text-brand-slate">هنوز پیشنهادی ثبت نشده — شروع از {coins(current.nextMin)}</div>
                )}
              </div>
            ) : current.status === "ENDED" ? (
              <div className="text-left">
                <div className="text-xs font-bold text-brand-slate">برنده</div>
                {current.winnerNickname ? (
                  <div className="mt-1">
                    <div className="font-black text-brand-navy">{current.winnerNickname}</div>
                    <Coin n={current.finalPrice ?? 0} />
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

          {notifPermission !== "unsupported" && notifPermission !== "granted" && (
            <button
              type="button"
              onClick={requestNotifPermission}
              className="btn-ghost !py-1.5 !px-3 text-xs"
              aria-label="فعال کردن اعلان مرورگر برای وقتی که پیشنهادت شکسته می‌شود"
            >
              <span aria-hidden>🔔</span> اعلان مرورگر
            </button>
          )}

          {isLive && isMyTeam && <Alert kind="info">این نسخهٔ ویژهٔ تیم خودت است؛ نمی‌توانی روی آن پیشنهاد بدهی.</Alert>}

          {isLive && !isMyTeam && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2" role="group" aria-label="پیشنهاد سریع">
                {quickAmounts.map((v, i) => {
                  const overWallet = v > currentUser.buyWallet;
                  return (
                    <button
                      key={v}
                      type="button"
                      disabled={pending || overWallet}
                      onClick={() => submitBid(v)}
                      aria-label={`ثبت پیشنهاد ${coins(v)}${i === 0 ? " (حداقل مجاز)" : ` (حداقل به‌علاوهٔ ${fa(QUICK_STEPS[i])})`}${
                        overWallet ? "، بیشتر از موجودی کیف خرید" : ""
                      }`}
                      className="btn-cyan !px-2 sm:!px-4 !py-3 sm:!py-2 text-sm sm:text-base disabled:opacity-40"
                    >
                      {i === 0 ? "حداقل" : `+${fa(QUICK_STEPS[i])}`} ({fa(v)})
                    </button>
                  );
                })}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canSubmitTyped && typed !== null) submitBid(typed);
                }}
              >
                <label htmlFor="bid-amount" className="sr-only">
                  مبلغ پیشنهاد دلخواه (سکه)
                </label>
                <input
                  id="bid-amount"
                  type="number"
                  inputMode="numeric"
                  className="input flex-1 min-w-0 sm:!w-32 sm:flex-none"
                  placeholder={fa(current.nextMin)}
                  value={amount}
                  min={current.nextMin}
                  step={1}
                  aria-describedby="bid-hint"
                  onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                />
                <button
                  type="submit"
                  disabled={!canSubmitTyped}
                  aria-label={typed !== null ? `ثبت پیشنهاد ${coins(typed)}` : "ثبت پیشنهاد دلخواه"}
                  className="btn-primary !px-5 !py-3 sm:!py-2 shrink-0 disabled:opacity-40"
                >
                  ثبت پیشنهاد
                </button>
              </form>
              <div id="bid-hint" className="text-xs text-brand-slate">
                حداقل پیشنهاد بعدی: {coins(current.nextMin)} · موجودی کیف خرید تو: {coins(currentUser.buyWallet)}
              </div>

              {currentUser.power === "SECOND_WIND" && !currentUser.powerUsed && (
                <button
                  type="button"
                  onClick={claimSecondWind}
                  disabled={pending}
                  aria-label="استفاده از قدرت نفس دوم: دو دقیقه تمدید این حراج"
                  className="btn-navy w-full sm:w-auto !px-4 !py-2"
                >
                  <span aria-hidden>⏱️</span> نفس دوم (دو دقیقه تمدید)
                </button>
              )}
            </div>
          )}

          <div>
            <h3 className="text-xs font-bold text-brand-slate mb-2">تاریخچهٔ پیشنهادها</h3>
            {current.bids.length === 0 ? (
              <div className="text-sm text-brand-slate">هنوز پیشنهادی ثبت نشده.</div>
            ) : (
              <ul className="space-y-1.5 stagger">
                {current.bids.map((b, i) => (
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
          {current.extensions > 0 && <>این حراج {fa(current.extensions)} بار تمدید شده است.</>}
        </div>
      </div>
    </div>
  );
}
