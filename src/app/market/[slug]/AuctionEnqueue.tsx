"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmDialog";
import { fa } from "@/lib/persian";
import { enqueueAuctionAction } from "./actions";

export type EnqueueOption = { trackId: string; label: string };

/**
 * دکمهٔ «فرستادن به حراج» برای اعضای تیم صاحب محصول.
 * `options`: محصول‌های قابل فرستادن؛ اگر تیم چند محصول داشته باشد، انتخاب می‌کند کدام یکی.
 * `slug`: صفحهٔ محصولی که باید تازه شود (در صفحهٔ حراج لازم نیست).
 */
export function AuctionEnqueue({ options, cutoffMin, slug }: { options: EnqueueOption[]; cutoffMin: number; slug?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [selected, setSelected] = useState(options[0]?.trackId ?? "");
  const confirm = useConfirm();

  async function send() {
    if (!(await confirm({ title: "همین حالا به صف حراج بفرستم؟", body: "نسخهٔ ویژهٔ هر محصول فقط یک‌بار حراج می‌شود و از صف بیرون نمی‌آید.", confirmLabel: "بفرست" }))) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await enqueueAuctionAction(selected, slug);
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
  if (options.length === 0) return null;

  return (
    <div className="space-y-2">
      {error && <Alert kind="error">{error}</Alert>}
      {options.length > 1 && (
        <div>
          <label className="label" htmlFor="auctionProduct">کدام محصول به حراج برود؟</label>
          <select id="auctionProduct" value={selected} onChange={(e) => setSelected(e.target.value)} className="input">
            {options.map((o) => (
              <option key={o.trackId} value={o.trackId}>{o.label}</option>
            ))}
          </select>
        </div>
      )}
      <button type="button" onClick={send} disabled={pending} className="btn-primary w-full">
        {pending ? "در حال فرستادن…" : "🔨 فرستادن به حراج"}
      </button>
      <p className="text-xs text-brand-slate leading-6">
        حراج‌ها یکی‌یکی و به ترتیب صف برگزار می‌شوند. صف تا {fa(cutoffMin)} دقیقه پیش از پایان مسابقه باز است.
      </p>
    </div>
  );
}
