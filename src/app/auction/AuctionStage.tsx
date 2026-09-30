"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Alert, Coin } from "@/components/ui";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { usePolling } from "@/hooks/usePolling";
import { fa, coins, toEnDigits } from "@/lib/persian";
import { placeBidAction, secondWindAction, bidBudgetAction } from "./actions";
import type { AuctionState, BidBudget } from "@/lib/auction";

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
/** خطای شبکه/سرور هنگام صدا زدن اکشن (مثلاً ری‌استارت سرور) نباید صفحه را به error boundary بفرستد. */
const NETWORK_ERROR = "ارتباط با سرور برقرار نشد؛ دوباره تلاش کن.";

/** سرآیند ساعت سرور در پاسخ‌های /api/auction (همان SERVER_TIME_HEADER در lib/auction-events؛ آن ماژول سمت سرور است). */
const SERVER_TIME_HEADER = "X-Server-Time";
/** تغییرِ کوچک‌تر از این در اختلاف ساعت نادیده گرفته می‌شود تا شمارش معکوس با نوسان شبکه نپرد. */
const CLOCK_JITTER_MS = 250;
/** مدت نمایش بنر «نتیجهٔ حراج قبلی» پس از شروع حراج بعدی. */
const PREV_RESULT_MS = 10_000;

type StreamPayload = { id: string | null; state: AuctionState | null };
type PrevResult = {
  auctionId: string;
  productName: string;
  hadBids: boolean;
  winnerNickname: string | null;
  winnerTeamName: string | null;
  finalPrice: number | null;
};

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
  initialBudget,
  currentUser,
}: {
  initialId: string | null;
  initialBudget: BidBudget | null;
  currentUser: { id: string; nickname: string; teamId: string | null; buyWallet: number; power: string; powerUsed: boolean };
}) {
  const [auctionId, setAuctionId] = useState(initialId);
  // بودجهٔ خصوصی کاربر (کیف خرید و رزرو حراج‌های دیگر) برای حراج جاری؛ از وضعیت عمومی حراج جداست.
  const [budget, setBudget] = useState<BidBudget | null>(initialBudget);
  const budgetFor = useRef<string | null>(initialId);
  const [state, setState] = useState<AuctionState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [outbid, setOutbid] = useState(false);
  // متن خام ورودی (ممکن است رقم فارسی داشته باشد)؛ عدد با toEnDigits از آن ساخته می‌شود.
  const [amount, setAmount] = useState("");
  const wasHighest = useRef(false);
  const lastStatus = useRef<string | null>(null);
  const lastFetchedId = useRef<string | null>(null);
  const prevAuctionId = useRef<string | null>(initialId);
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
  // نتیجهٔ حراجی که همین حالا تمام شد (حراج بعدی بلافاصله جایش را می‌گیرد و ENDED آن دیده نمی‌شود).
  const [prevResult, setPrevResult] = useState<PrevResult | null>(null);
  // اختلاف ساعت سرور و مرورگر (ms). ساعت بعضی گوشی‌ها چند ثانیه جلو/عقب است؛ شمارش معکوس با
  // serverNow() حساب می‌شود. تا نمونهٔ اول نرسیده null است (یعنی همان ساعت مرورگر).
  const clockOffset = useRef<number | null>(null);
  // نوار پیشنهاد ثابت پایین صفحه در موبایل؛ ارتفاعش به padding پایین <html> اضافه می‌شود تا محتوا زیرش نماند.
  const bidBarRef = useRef<HTMLDivElement | null>(null);

  const serverNow = useCallback(() => Date.now() + (clockOffset.current ?? 0), []);

  /** یک نمونهٔ ساعت سرور: serverMs در لحظهٔ محلیِ localMs. نمونهٔ نامعتبر نادیده گرفته می‌شود. */
  const noteServerTime = useCallback((serverMs: number, localMs: number) => {
    if (!Number.isFinite(serverMs) || serverMs <= 0 || !Number.isFinite(localMs)) return;
    const offset = Math.round(serverMs - localMs);
    const prev = clockOffset.current;
    if (prev !== null && Math.abs(offset - prev) < CLOCK_JITTER_MS) return;
    clockOffset.current = offset;
    setNow(Date.now() + offset);
  }, []);

  /** ساعت سرور از سرآیند پاسخ fetch؛ لحظهٔ محلی وسط رفت‌وبرگشت فرض می‌شود. نبود سرآیند بی‌اثر است. */
  const noteResponseTime = useCallback(
    (res: Response, sentAt: number) => {
      const raw = res.headers.get(SERVER_TIME_HEADER);
      if (!raw) return;
      noteServerTime(Number(raw), (sentAt + Date.now()) / 2);
    },
    [noteServerTime]
  );

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

  /** بودجهٔ تازه را از سرور می‌گیرد؛ پاسخِ مانده از حراج قبلی نادیده گرفته می‌شود. */
  const refreshBudget = useCallback((id: string | null) => {
    budgetFor.current = id;
    bidBudgetAction(id)
      .then((b) => {
        if (b && budgetFor.current === b.auctionId) setBudget(b);
      })
      .catch(() => {});
  }, []);

  // با عوض شدن حراج جاری یا موجودی سرور (مثلاً پس از router.refresh)، بودجه دوباره گرفته شود.
  useEffect(() => {
    if (budget && budget.auctionId === auctionId && budget.buyWallet === currentUser.buyWallet) return;
    refreshBudget(auctionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- فقط با تغییر حراج یا موجودی سرور
  }, [auctionId, currentUser.buyWallet, refreshBudget]);

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
      // (تغییر موجودی سرور پس از رفرش، بودجه را هم از طریق effect بالا تازه می‌کند.)
      if (lastStatus.current === "LIVE" && data.status === "ENDED") router.refresh();
      lastStatus.current = data.status;

      setState(data);
      setNow(serverNow());
    },
    [currentUser.id, router, triggerOutbidAlert, serverNow]
  );

  /** یک بار وضعیت یک حراج را می‌گیرد؛ برای polling پشتیبان و تازه‌سازی بلافاصله پس از پیشنهاد. */
  const fetchState = useCallback(
    async (id: string) => {
      const sentAt = Date.now();
      const res = await fetch(`/api/auction/${id}/state`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      noteResponseTime(res, sentAt);
      const data: AuctionState = await res.json();
      applyState(data);
      return data;
    },
    [applyState, noteResponseTime]
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
    const onClock = (ev: MessageEvent<string>) => {
      try {
        const { now: serverMs } = JSON.parse(ev.data) as { now?: unknown };
        if (typeof serverMs === "number") noteServerTime(serverMs, Date.now());
      } catch {
        /* پیام خراب؛ heartbeat بعدی دوباره ساعت را می‌فرستد */
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
    es.addEventListener("clock", onClock);
    es.addEventListener("error", onError);
    return () => {
      es.removeEventListener("open", onOpen);
      es.removeEventListener("state", onState);
      es.removeEventListener("clock", onClock);
      es.removeEventListener("error", onError);
      es.close();
    };
  }, [mode, applyState, noteServerTime]);

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
        const sentAt = Date.now();
        const res = await fetch("/api/auction/live", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        noteResponseTime(res, sentAt);
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
    const t = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(t);
  }, [serverNow]);

  const submitBid = useCallback(
    (value: number) => {
      if (!auctionId) return;
      setError(null);
      startTransition(async () => {
        try {
          const res = await placeBidAction(auctionId, value);
          if ("budget" in res && res.budget && res.budget.auctionId === budgetFor.current) setBudget(res.budget);
          if ("error" in res && res.error) setError(res.error);
          else {
            setOutbid(false);
            setAmount("");
          }
        } catch {
          setError(NETWORK_ERROR);
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
    if (!confirm("نفس دوم فقط یک‌بار در کل بازی قابل استفاده است. همین حالا این حراج را دو دقیقه تمدید کنم؟")) return;
    startTransition(async () => {
      try {
        const res = await secondWindAction(auctionId);
        if ("error" in res && res.error) setError(res.error);
        else router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
      await fetchState(auctionId).catch(() => null);
    });
  }, [auctionId, fetchState, router]);

  // حراج عوض شد (قبلی تسویه شد و بعدی بلافاصله زنده شد، یا صف تمام شد): ممکن است وضعیت ENDED
  // حراج قبلی هیچ‌وقت به کلاینت نرسیده باشد؛ پس کیف خرید و فهرست صف/پایان‌یافته‌ها را از سرور تازه کن.
  // در همان حال نتیجهٔ نهایی حراج قبلی یک‌بار گرفته و چند ثانیه در بنری بالای صحنه نشان داده می‌شود.
  useEffect(() => {
    const prev = prevAuctionId.current;
    prevAuctionId.current = auctionId;
    if (prev === auctionId) return;
    router.refresh();
    if (!prev) return;
    let cancelled = false;
    fetch(`/api/auction/${prev}/state`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<AuctionState>) : null))
      .then((data) => {
        // فقط حراجی که واقعاً تمام شده (نه مثلاً حراج در صفی که برگزارکننده جابه‌جا کرده).
        if (cancelled || !data || data.id !== prev || data.status !== "ENDED") return;
        setPrevResult({
          auctionId: data.id,
          productName: data.product.specialName,
          hadBids: data.bids.length > 0,
          winnerNickname: data.winnerNickname,
          winnerTeamName: data.winnerTeamName ?? null,
          finalPrice: data.finalPrice,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [auctionId, router]);

  // بنر نتیجهٔ حراج قبلی پس از چند ثانیه خودش بسته می‌شود.
  useEffect(() => {
    if (!prevResult) return;
    const t = setTimeout(() => setPrevResult(null), PREV_RESULT_MS);
    return () => clearTimeout(t);
  }, [prevResult]);

  // وضعیتِ مانده از حراج قبلی نباید نمایش داده شود.
  const current = auctionId && state && state.id === auctionId ? state : null;
  // نوار پیشنهاد فقط در حراج زنده و برای محصول تیم‌های دیگر رندر می‌شود.
  const hasBidBar =
    current?.status === "LIVE" && !(!!currentUser.teamId && current.product.teamId === currentUser.teamId);

  // در موبایل نوار پیشنهاد fixed است و انتهای صفحه را می‌پوشاند؛ به‌اندازهٔ ارتفاعش به پایین سند
  // (padding روی <html>، تا با فاصله‌ای که نوار پایین سایت روی body/main می‌گذارد جمع شود) فضا بده.
  useEffect(() => {
    const el = bidBarRef.current;
    if (!hasBidBar || !el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const original = root.style.paddingBottom;
    const update = () => {
      root.style.paddingBottom = getComputedStyle(el).position === "fixed" ? `${el.offsetHeight}px` : original;
    };
    update();
    // عبور از مرز sm پهنای نوار را عوض می‌کند، پس همین ResizeObserver آن را هم پوشش می‌دهد.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.paddingBottom = original;
    };
  }, [hasBidBar]);

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
  const prevBanner = (className: string) =>
    prevResult ? (
      <div className={`anim-pop ${className}`} role="status">
        <div className="flex items-start gap-3 rounded-2xl border border-brand-mist bg-brand-ice px-4 py-3 text-sm text-brand-navy">
          <span aria-hidden className="text-lg leading-6">
            🔨
          </span>
          <p className="flex-1 min-w-0 leading-6 break-words">
            <b>حراج قبلی:</b> {prevResult.productName} —{" "}
            {prevResult.winnerNickname ? (
              <>
                برنده: <b>{prevResult.winnerNickname}</b>
                {prevResult.winnerTeamName && <span className="text-brand-slate"> ({prevResult.winnerTeamName})</span>} با{" "}
                <span className="fa-num font-black">{coins(prevResult.finalPrice ?? 0)}</span>
              </>
            ) : prevResult.hadBids ? (
              "بدون پیشنهاد معتبر فروخته نشد"
            ) : (
              "بدون پیشنهاد فروخته نشد"
            )}
          </p>
          <button
            type="button"
            onClick={() => setPrevResult(null)}
            aria-label="بستن نتیجهٔ حراج قبلی"
            className="-m-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-brand-slate hover:bg-brand-mist hover:text-brand-navy"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
      </div>
    ) : null;
  const liveRegion = (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announced}
    </div>
  );

  if (!current && auctionId) {
    return (
      <>
        {prevBanner("mb-4")}
        <div className="card p-10 text-center" aria-busy="true">
          {banner}
          {liveRegion}
          <p className="text-brand-slate">در حال دریافت وضعیت حراج…</p>
        </div>
      </>
    );
  }

  if (!current) {
    return (
      <>
        {prevBanner("mb-4")}
        <div className="card p-10 text-center anim-pop">
          {banner}
          {liveRegion}
          <div className="text-5xl mb-3" aria-hidden>
            ⏳
          </div>
          <h3 className="text-xl font-black">فعلاً حراجی زنده نیست</h3>
          <p className="mt-2 text-brand-slate">منتظر شروع حراج بعدی توسط برگزارکننده باش.</p>
        </div>
      </>
    );
  }

  const endsAtMs = current.endsAt ? new Date(current.endsAt).getTime() : null;
  const remaining = endsAtMs ? endsAtMs - now : 0;
  const isLive = current.status === "LIVE";
  // زمان تمام شده ولی تسویه هنوز نرسیده: دکمه‌ها غیرفعال تا پیشنهاد بی‌فایده (و خطای «تمام شده») ثبت نشود.
  const biddingOpen = isLive && remaining > 0;
  const urgent = isLive && remaining <= 30_000;
  const isMyTeam = !!currentUser.teamId && current.product.teamId === currentUser.teamId;
  const quickAmounts = QUICK_STEPS.map((step) => current.nextMin + step);
  // بودجه: اگر بودجهٔ همین حراج هنوز نرسیده، از کیف خرید سرور بدون رزرو استفاده می‌شود (سرور در هر حال بررسی می‌کند).
  const myBudget = budget && budget.auctionId === current.id ? budget : null;
  const wallet = myBudget?.buyWallet ?? currentUser.buyWallet;
  const reservedElsewhere = myBudget?.reservedElsewhere ?? 0;
  const spendable = myBudget?.spendable ?? Math.max(0, wallet - reservedElsewhere);
  const iLead = current.highest?.userId === currentUser.id;
  const reservedHere = iLead && current.highest ? current.highest.amount : 0;
  const reserved = reservedElsewhere + reservedHere;
  // برای کارت «کیف خرید تو»: کل رزرو (پیشتازی در همین حراج فقط تا وقتی زنده است) و باقیِ واقعاً آزاد کیف.
  const reservedTotal = reservedElsewhere + (isLive ? reservedHere : 0);
  const freeToSpend = Math.max(0, wallet - reservedTotal);
  const cantAffordNext = current.nextMin > spendable;
  const typedText = toEnDigits(amount.trim()).replace(/[٬,\s]/g, "");
  const typed = typedText === "" || !/^\d+$/.test(typedText) ? null : Number(typedText);
  const canSubmitTyped =
    biddingOpen && !pending && typed !== null && typed >= current.nextMin && typed <= spendable;

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
      {banner}
      {liveRegion}
      {prevBanner("lg:col-span-2")}
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
              {/* در موبایل نوار پیشنهاد (دکمه‌های سریع + مبلغ دلخواه) ثابت پایین صفحه می‌ماند: بالای نوار پایین
                  سایت (--bottom-nav-h) و با فاصلهٔ ناحیهٔ امن. از sm به بالا همان جای عادی خودش است. */}
              <div
                ref={bidBarRef}
                className="space-y-2 sm:space-y-3 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-[var(--bottom-nav-h,0px)] max-sm:z-30 max-sm:border-t max-sm:border-[var(--border)] max-sm:bg-[var(--surface)] max-sm:px-4 max-sm:pt-2.5 max-sm:pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)-var(--bottom-nav-h,0px)))] max-sm:shadow-[0_-8px_24px_-12px_rgba(0,45,71,0.35)]"
              >
                {/* خلاصهٔ فشرده برای موبایل (تایمر و متن‌های بالای صفحه ممکن است بیرون از دید باشند). اعلان‌ها از Alert/aria-live بالا می‌آیند. */}
                <div className="flex items-center justify-between gap-2 text-xs sm:hidden" aria-hidden>
                  <span className={`fa-num font-black tabular-nums shrink-0 ${urgent ? "text-brand-red" : "text-brand-navy"}`}>
                    ⏱ {mmss(remaining)}
                  </span>
                  {error || outbid ? (
                    <span className="min-w-0 truncate font-bold text-brand-red">{error ?? "روی شما پیشنهاد بالاتر داده شد!"}</span>
                  ) : (
                    <span className="min-w-0 truncate text-brand-slate">
                      حداقل <b className="fa-num text-brand-navy">{fa(current.nextMin)}</b> · قابل‌خرج{" "}
                      <b className="fa-num text-brand-navy">{fa(spendable)}</b>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2" role="group" aria-label="پیشنهاد سریع">
                  {quickAmounts.map((v, i) => {
                    const overWallet = v > spendable;
                    return (
                      <button
                        key={v}
                        type="button"
                        disabled={pending || overWallet || !biddingOpen}
                        onClick={() => submitBid(v)}
                        aria-label={`ثبت پیشنهاد ${coins(v)}${i === 0 ? " (حداقل مجاز)" : ` (حداقل به‌علاوهٔ ${fa(QUICK_STEPS[i])})`}${
                          overWallet ? "، بیشتر از موجودی قابل‌خرج" : ""
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
                  {/* type=text تا رقم فارسی هم پذیرفته شود (input عددی رقم فارسی را رد می‌کند). */}
                  <input
                    id="bid-amount"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    dir="ltr"
                    className="input fa-num flex-1 min-w-0 sm:!w-32 sm:flex-none"
                    placeholder={fa(current.nextMin, { sep: false })}
                    value={amount}
                    aria-describedby="bid-hint"
                    aria-invalid={amount.trim() !== "" && typed === null ? true : undefined}
                    onChange={(e) => setAmount(e.target.value)}
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
              </div>
              <div id="bid-hint" className="space-y-1 text-xs text-brand-slate">
                <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-brand-ice px-3 py-2">
                  <span>
                    موجودی کیف خرید: <span className="fa-num font-bold text-brand-navy">{coins(wallet)}</span>
                  </span>
                  <span>
                    رزرو‌شده: <span className="fa-num font-bold text-brand-navy">{coins(reserved)}</span>
                  </span>
                  <span>
                    قابل‌خرج برای این حراج: <span className="fa-num font-black text-brand-navy">{coins(spendable)}</span>
                  </span>
                </div>
                <div>
                  حداقل پیشنهاد بعدی: {coins(current.nextMin)}
                  {iLead && <> · پیشنهاد پیشتاز فعلی‌ات ({coins(reservedHere)}) رزرو است؛ بالا بردنش جایگزینش می‌کند، نه اضافه.</>}
                  {reservedElsewhere > 0 && <> · {coins(reservedElsewhere)} برای پیشتازی‌ات در حراج دیگر رزرو است.</>}
                </div>
                {cantAffordNext && (
                  <div className="font-bold text-brand-red">
                    حداقل پیشنهاد بعدی ({coins(current.nextMin)}) از موجودی قابل‌خرجت ({coins(spendable)}) بیشتر است؛
                    {iLead ? " فعلاً پیشتازی، ولی نمی‌توانی پیشنهادت را بالاتر ببری." : " فعلاً نمی‌توانی پیشنهاد بدهی."}
                  </div>
                )}
              </div>

              {currentUser.power === "SECOND_WIND" && !currentUser.powerUsed && (
                <button
                  type="button"
                  onClick={claimSecondWind}
                  disabled={pending || !biddingOpen}
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
        <Coin n={wallet} />
        {reservedTotal > 0 && (
          <div className="mt-2 text-xs text-brand-slate">
            قابل‌خرج: <span className="fa-num font-black text-brand-navy">{coins(freeToSpend)}</span> (
            <span className="fa-num">{coins(reservedTotal)}</span> رزرو در حراج)
          </div>
        )}
        <div className="mt-4 text-xs text-brand-slate">
          {current.extensions > 0 && <>این حراج {fa(current.extensions)} بار تمدید شده است.</>}
        </div>
      </div>
    </div>
  );
}
