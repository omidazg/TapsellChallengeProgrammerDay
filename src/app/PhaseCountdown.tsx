"use client";

import { useEffect, useState } from "react";
import { duration } from "@/lib/persian";

/** شمارش معکوس زندهٔ فاز جاری؛ هر ثانیه به‌روزرسانی می‌شود. */
export function PhaseCountdown({ endsAt }: { endsAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  if (!endsAt) return <span className="text-brand-slate text-sm">بدون زمان‌بندی</span>;
  const remaining = new Date(endsAt).getTime() - now;
  return (
    <span className="fa-num font-black text-2xl text-brand-red">
      {duration(remaining)}
    </span>
  );
}
