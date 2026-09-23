"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { fa } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { POWERS, DEFAULTS } from "@/lib/constants";
import { angelPowerAction, type AngelActionState } from "./actions";

// کانفتی جشن فقط پس از فعال‌سازی موفق لازم است؛ با ssr:false و mount شرطی زیر بار اولیهٔ صفحه سبک می‌ماند.
const Celebrate = dynamic(() => import("@/components/Celebrate").then((m) => m.Celebrate), { ssr: false });

/**
 * کارت قدرت «فرشته» در طبقهٔ سرمایه‌گذاری: پیش از کلیک نشان می‌دهد سرمایه دقیقاً
 * روی کدام ایده (کم‌سرمایه‌ترین ایدهٔ یک تیم دیگر) خواهد نشست، و پس از فعال‌سازی
 * با نام همان ایده تأیید می‌کند.
 */
export function AngelCard({ ideaTitle, teamName }: { ideaTitle: string; teamName: string }) {
  const [state, formAction, pending] = useActionState<AngelActionState, FormData>(async () => angelPowerAction(), {});
  const [celebrate, setCelebrate] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- واکنش به نتیجهٔ server action (منبع خارجی)، نه همگام‌سازی رندر
      setCelebrate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="card p-6 anim-rise space-y-3">
      {celebrate && <Celebrate message="سرمایه‌گذاری فرشته ثبت شد 👼" show onDone={() => setCelebrate(false)} />}
      <h3 className="font-black text-brand-navy">
        {POWERS.ANGEL.emoji} قدرت «{POWERS.ANGEL.label}»
      </h3>
      <p className="text-sm text-brand-slate">{POWERS.ANGEL.desc}</p>

      {state.error && <Alert kind="error">{state.error}</Alert>}

      {state.ok ? (
        <Alert kind="ok">
          {fa(DEFAULTS.angelBonus)} سکهٔ بذر از هیچ ساخته و روی «{state.ideaTitle ?? ideaTitle}» سرمایه‌گذاری شد؛ سود این
          سرمایه‌گذاری مال توست.
        </Alert>
      ) : (
        <>
          <p className="text-sm text-brand-navy">
            الان کم‌سرمایه‌ترین ایده، «<b>{ideaTitle}</b>» از تیم {teamName} است. با فعال‌سازی این قدرت، {fa(DEFAULTS.angelBonus)}{" "}
            سکهٔ تازه (بدون کم‌شدن از کیف بذر خودت) دقیقاً روی همین ایده سرمایه‌گذاری می‌شود.
          </p>
          <form action={formAction}>
            <button type="submit" disabled={pending} className="btn-cyan w-full">
              {pending ? "در حال فعال‌سازی…" : `👼 فعال‌سازی روی «${ideaTitle}»`}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
