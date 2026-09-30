"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { coins } from "@/lib/persian";
import { chooseShieldAction, type ShieldActionState } from "./actions";

export type ShieldPickerCandidate = {
  teamId: string;
  teamName: string;
  ideaTitle: string;
  invested: number;
  maxCredit: number; // floor(invested × ۰٫۵)
};

/**
 * انتخاب هدف قدرت «سپر»: فهرست سرمایه‌گذاری‌های واجد شرایط، هرکدام با یک دکمه.
 * انتخاب نهایی و برگشت‌ناپذیر است، پس پیش از ارسال تأیید گرفته می‌شود.
 */
export function ShieldPicker({ candidates }: { candidates: ShieldPickerCandidate[] }) {
  const [state, formAction, pending] = useActionState<ShieldActionState, FormData>(chooseShieldAction, {});
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (candidates.length === 0) {
    return (
      <Alert kind="info">
        هنوز روی ایدهٔ هیچ تیم دیگری سرمایه‌گذاری نکرده‌ای؛ سپر فقط روی یکی از سرمایه‌گذاری‌هایت می‌نشیند.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">سپر ثبت شد.</Alert>}
      <ul className="space-y-2">
        {candidates.map((c) => (
          <li key={c.teamId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-mist p-3">
            <div className="min-w-0 break-words">
              <div className="font-bold text-brand-navy">
                {c.teamName} · «{c.ideaTitle}»
              </div>
              <div className="text-xs text-brand-slate">
                سرمایه‌گذاری تو: {coins(c.invested)} · بیشترین اثر سپر: {coins(c.maxCredit)} در امتیاز پرتفوی
              </div>
            </div>
            <form
              action={formAction}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `سپر روی سرمایه‌گذاری‌ات در «${c.teamName}» گذاشته شود؟ این انتخاب نهایی است و دیگر قابل تغییر نیست.`
                  )
                )
                  e.preventDefault();
              }}
            >
              <input type="hidden" name="teamId" value={c.teamId} />
              <button type="submit" disabled={pending} className="btn-cyan !px-4 !py-2 w-full sm:w-auto">
                {pending ? "در حال ثبت…" : "🛡️ سپر را روی این بگذار"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
