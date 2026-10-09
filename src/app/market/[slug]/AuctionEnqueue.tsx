"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { fa } from "@/lib/persian";
import { enqueueAuctionAction } from "./actions";

/** دکمهٔ «فرستادن به حراج» برای اعضای تیم صاحب محصول، در روز بازار. */
export function AuctionEnqueue({ slug, cutoffMin }: { slug: string; cutoffMin: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  function send() {
    if (!confirm("نسخهٔ ویژهٔ هر محصول فقط یک‌بار حراج می‌شود و از صف بیرون نمی‌آید. همین حالا به صف حراج بفرستم؟")) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await enqueueAuctionAction(slug);
        if (res.error) {
          setError(res.error);
          return;
        }
        setDone(res.position ?? null);
        router.refresh();
      } catch {
        setError("ارتباط با سرور برقرار نشد؛ دوباره تلاش کن.");
      }
    });
  }

  if (done !== null) {
    return <Alert kind="ok">به صف حراج رفت؛ جایگاه {fa(done)} در صف.</Alert>;
  }

  return (
    <div className="space-y-2">
      {error && <Alert kind="error">{error}</Alert>}
      <button type="button" onClick={send} disabled={pending} className="btn-primary w-full">
        {pending ? "در حال فرستادن…" : "🔨 فرستادن به حراج"}
      </button>
      <p className="text-xs text-brand-slate leading-6">
        حراج‌ها یکی‌یکی و به ترتیب صف برگزار می‌شوند. صف تا {fa(cutoffMin)} دقیقه پیش از پایان روز بازار باز است.
      </p>
    </div>
  );
}
