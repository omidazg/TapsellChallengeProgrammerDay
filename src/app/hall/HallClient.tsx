"use client";

import { useEffect, useRef, useState } from "react";
import { fa, coins, duration } from "@/lib/persian";
import { usePolling } from "@/hooks/usePolling";
import { Avatar } from "@/components/Avatar";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import type { HallPayload } from "@/lib/hall";

/**
 * نمای سالن (/hall): صفحهٔ پروژکتور، بدون ورود، بدون قالب اصلی سایت (AppShell).
 *
 * AppShell در layout.tsx همیشه صفحه را در خود می‌پیچد و این کامپوننت مالک آن فایل‌ها نیست؛
 * پس به‌جای ویرایش AppShell، این صفحه یک overlay ثابت با z-index بالاتر از کل قالب
 * (هدر sticky با z-40، منوی موبایل با z-40) روی کل ویوپورت می‌کشد تا پس‌زمینهٔ تیرهٔ
 * مخصوص خودش و بدون هیچ ناوبری‌ای نمایش داده شود.
 * (شرح دقیق تغییر جایگزین در AppShell در گزارش پایان کار آمده است.)
 */
export function HallClient() {
  const [data, setData] = useState<HallPayload | null>(null);
  const [failures, setFailures] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const skewRef = useRef(0);
  const prevPhaseRef = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // ساعت محلی برای شمارش معکوس نرم؛ هر ثانیه به‌روز می‌شود.
  useEffect(() => {
    const update = () => setNow(Date.now() + skewRef.current);
    const first = setTimeout(update, 0);
    const tick = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
    };
  }, []);

  usePolling(async () => {
    try {
      const res = await fetch("/api/hall", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const payload = (await res.json()) as HallPayload;
      setData(payload);
      setFailures(0);
      const serverNow = new Date(payload.serverNow).getTime();
      if (!Number.isNaN(serverNow)) skewRef.current = serverNow - Date.now();
      // فقط تغییر واقعی فاز با aria-live="polite" اعلام می‌شود (بقیهٔ صفحه aria-live خاموش دارد).
      if (prevPhaseRef.current !== null && prevPhaseRef.current !== payload.phase) {
        setAnnouncement(`فاز بازی به «${payload.phaseLabel}» تغییر کرد`);
      }
      prevPhaseRef.current = payload.phase;
    } catch {
      setFailures((n) => n + 1);
    }
  }, 3000);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      rootRef.current?.requestFullscreen().catch(() => {});
    }
  };

  const remaining = data?.endsAt && now !== null ? new Date(data.endsAt).getTime() - now : null;

  return (
    <div
      ref={rootRef}
      dir="rtl"
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#031c2e] text-white"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <ConnectionBanner failing={failures >= 2} />
      {/* اعلان‌های صفحه‌خوان فقط برای تغییر فاز؛ بقیهٔ به‌روزرسانی‌ها بی‌صدا هستند */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <HallHeader phaseLabel={data?.phaseLabel} remaining={remaining} onToggleFullscreen={toggleFullscreen} isFullscreen={isFullscreen} />

      {data === null ? (
        <div className="flex-1 flex items-center justify-center text-2xl text-white/60">در حال بارگذاری نمای سالن…</div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.1fr_1.4fr_1.1fr] gap-4 p-4">
          <TopTeamsPanel teams={data.topTeams} metricLabel={data.metricLabel} />
          <AuctionPanel auction={data.auction} now={now} />
          <FeedPanel feed={data.feed} />
        </div>
      )}

      <TickerBar ticker={data?.ticker ?? null} />
    </div>
  );
}

function HallHeader({
  phaseLabel,
  remaining,
  onToggleFullscreen,
  isFullscreen,
}: {
  phaseLabel?: string;
  remaining: number | null;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}) {
  return (
    <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10 shrink-0">
      <div className="flex items-center gap-4 min-w-0">
        <span className="inline-block size-3 rounded-full bg-brand-red pulse-ring shrink-0" aria-hidden />
        <h1 className="text-2xl sm:text-3xl font-black truncate">میدان بنیان‌گذاران تپسل</h1>
      </div>
      <div className="flex items-center gap-6 shrink-0">
        {phaseLabel && (
          <div className="text-left">
            <div className="text-xs sm:text-sm text-brand-cyan font-bold">{phaseLabel}</div>
            <div className="fa-num text-3xl sm:text-5xl font-black tabular-nums">
              {remaining !== null ? duration(remaining) : "…"}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="rounded-full border border-white/25 px-4 py-2 text-sm sm:text-base font-bold hover:bg-white/10 transition"
        >
          {isFullscreen ? "خروج از تمام‌صفحه" : "🖥️ تمام‌صفحه"}
        </button>
      </div>
    </header>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-h-0 flex flex-col rounded-3xl bg-white/[0.04] border border-white/10 overflow-hidden">
      <h2 className="px-5 py-3 text-lg sm:text-xl font-black text-brand-cyan border-b border-white/10 shrink-0">{title}</h2>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>
    </section>
  );
}

function TopTeamsPanel({ teams, metricLabel }: { teams: HallPayload["topTeams"]; metricLabel: string }) {
  return (
    <Panel title={`تیم‌های برتر · ${metricLabel}`}>
      {teams.length === 0 ? (
        <p className="text-white/50 text-lg">هنوز تیمی رتبه‌بندی نشده</p>
      ) : (
        <ol className="space-y-3">
          {teams.map((t, i) => (
            <li key={t.teamId} className="flex items-center gap-3 anim-rise">
              <span className="w-8 text-xl sm:text-2xl font-black text-amber-400 fa-num shrink-0">{fa(i + 1)}</span>
              <Avatar seed={t.logoSeed || t.teamId} size={40} />
              <span className="flex-1 min-w-0 truncate text-lg sm:text-2xl font-bold">{t.name}</span>
              <span className="fa-num text-xl sm:text-2xl font-black text-brand-cyan shrink-0">{fa(Math.round(t.metric))}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function AuctionPanel({ auction, now }: { auction: HallPayload["auction"]; now: number | null }) {
  const remaining = auction?.endsAt && now !== null ? new Date(auction.endsAt).getTime() - now : null;
  return (
    <Panel title="حراج زنده">
      {!auction ? (
        <div className="h-full flex items-center justify-center text-white/50 text-xl text-center">
          هیچ حراجی در حال حاضر برگزار نمی‌شود
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3 anim-pop">
          <div className="text-sm sm:text-base text-white/60">{auction.teamName}</div>
          <div className="text-2xl sm:text-4xl font-black">{auction.specialName || auction.productName}</div>
          <div className="mt-2 fa-num text-4xl sm:text-6xl font-black text-amber-400">{coins(auction.currentPrice)}</div>
          <div className="text-lg sm:text-xl text-white/80">
            {auction.leaderNickname ? `پیشتاز: ${auction.leaderNickname}` : "هنوز پیشنهادی ثبت نشده"}
          </div>
          {auction.status === "LIVE" && remaining !== null && (
            <div className="fa-num mt-4 text-3xl sm:text-5xl font-black text-brand-red">{duration(remaining)}</div>
          )}
          {auction.status === "SCHEDULED" && <div className="mt-4 text-lg text-white/60">به‌زودی شروع می‌شود</div>}
        </div>
      )}
    </Panel>
  );
}

function FeedPanel({ feed }: { feed: HallPayload["feed"] }) {
  return (
    <Panel title="رویدادهای زنده">
      {feed.length === 0 ? (
        <p className="text-white/50 text-lg">هنوز رویدادی ثبت نشده</p>
      ) : (
        <ul className="space-y-2.5">
          {feed.slice(0, 10).map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 text-base sm:text-lg anim-rise">
              <span className="text-xl shrink-0" aria-hidden>{e.emoji}</span>
              <span className="min-w-0 break-words">{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TickerBar({ ticker }: { ticker: HallPayload["ticker"] | null }) {
  const items = ticker?.recent ?? [];
  const loop = items.length > 0 ? [...items, ...items] : [];
  return (
    <div className="shrink-0 border-t border-white/10 bg-black/30 h-14 flex items-center overflow-hidden">
      {loop.length === 0 ? (
        <div className="px-6 text-white/50 text-base">هنوز خریدی ثبت نشده…</div>
      ) : (
        <div className="flex items-center gap-10 px-6 whitespace-nowrap animate-[ticker_28s_linear_infinite] text-lg sm:text-xl font-bold">
          {loop.map((it, i) => (
            <span key={i} className="fa-num">
              {it.buyer} از تیم {it.team} ✦ {fa(it.amount)} سکه
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
