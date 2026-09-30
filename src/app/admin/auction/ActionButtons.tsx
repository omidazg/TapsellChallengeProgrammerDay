"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui";
import {
  ensureAuctionsAction,
  startNextAuctionAction,
  closeDueSlotsAction,
  ensureAdSlotsAction,
  settleCurrentAuctionAction,
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
  const cls = tone === "primary" ? "btn-primary" : tone === "cyan" ? "btn-cyan" : "btn-ghost";
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
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
      <ActionButton label="ساخت صف حراج" action={ensureAuctionsAction} tone="ghost" />
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
    </div>
  );
}

export function AdSlotActionButtons() {
  return (
    <div className="flex flex-wrap gap-4">
      <ActionButton label="ساخت جایگاه‌ها" action={ensureAdSlotsAction} tone="ghost" />
      <ActionButton
        label="بستن جایگاه‌های سررسیده"
        action={closeDueSlotsAction}
        tone="cyan"
        confirmText="همهٔ جایگاه‌های تبلیغاتی سررسیده بسته و به برنده‌ها واگذار شوند؟"
      />
    </div>
  );
}
