"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui";
import { useConfirmSubmit } from "@/components/ConfirmDialog";
import {
  ensureAuctionsAction,
  startNextAuctionAction,
  ensureAdSlotsAction,
  settleCurrentAuctionAction,
  moveAuctionAction,
  type AuctionAdminState,
} from "./actions";

function ActionButton({
  label,
  action,
  tone = "ghost",
  confirmText,
}: {
  label: string;
  action: () => Promise<AuctionAdminState>;
  tone?: "primary" | "cyan" | "ghost";
  /** اگر داده شود، پیش از اجرا از برگزارکننده تأیید گرفته می‌شود (برای کارهای برگشت‌ناپذیر) */
  confirmText?: string;
}) {
  const [state, formAction, pending] = useActionState<AuctionAdminState, FormData>(async () => action(), {});
  const confirmSubmit = useConfirmSubmit();
  const cls = tone === "primary" ? "btn-primary" : tone === "cyan" ? "btn-cyan" : "btn-ghost";
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmText) confirmSubmit(e, confirmText);
      }}
      className="space-y-1"
    >
      <button type="submit" disabled={pending} className={`${cls} w-full sm:w-auto`}>
        {pending ? "در حال اجرا…" : label}
      </button>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <span className="block text-xs text-emerald-600 font-bold">انجام شد</span>}
    </form>
  );
}

export function AuctionActionButtons() {
  return (
    <div className="flex flex-wrap gap-4">
      <ActionButton
        label="شروع حراج بعدی"
        action={startNextAuctionAction}
        tone="primary"
        confirmText="حراج بعدی صف برای همه زنده شود؟"
      />
      <ActionButton
        label="پایان دستی حراج جاری"
        action={settleCurrentAuctionAction}
        tone="cyan"
        confirmText="حراج زندهٔ جاری همین حالا بسته و به بالاترین پیشنهاد فعلی واگذار شود؟ این کار برگشت‌ناپذیر است."
      />
      <ActionButton
        label="افزودن همهٔ محصولات باقی‌مانده به صف"
        action={ensureAuctionsAction}
        tone="ghost"
        confirmText="همهٔ محصولات ثبت‌شده‌ای که تیمشان هنوز به حراج نفرستاده، با ترتیب تصادفی ته صف حراج بروند؟"
      />
    </div>
  );
}

/** دکمه‌های ↑/↓ جابه‌جایی یک حراجِ در صف */
export function MoveAuctionButtons({ auctionId, label, canUp, canDown }: { auctionId: string; label: string; canUp: boolean; canDown: boolean }) {
  const [state, formAction, pending] = useActionState<AuctionAdminState, FormData>(moveAuctionAction, {});
  const btn =
    "inline-flex items-center justify-center size-9 shrink-0 rounded-full border border-brand-mist bg-white font-bold text-brand-navy transition hover:bg-brand-ice disabled:opacity-30";
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="auctionId" value={auctionId} />
      <button type="submit" name="dir" value="up" disabled={pending || !canUp} className={btn} aria-label={`جلوتر بردن «${label}» در صف`} title="جلوتر در صف">
        <span aria-hidden>↑</span>
      </button>
      <button type="submit" name="dir" value="down" disabled={pending || !canDown} className={btn} aria-label={`عقب‌تر بردن «${label}» در صف`} title="عقب‌تر در صف">
        <span aria-hidden>↓</span>
      </button>
      {state.error && <span className="text-xs text-brand-red" role="alert">{state.error}</span>}
    </form>
  );
}

export function AdSlotActionButtons() {
  return (
    <div className="flex flex-wrap gap-4">
      <ActionButton label="ساخت جایگاه‌ها تا ددلاین نهایی" action={ensureAdSlotsAction} tone="ghost" />
    </div>
  );
}
