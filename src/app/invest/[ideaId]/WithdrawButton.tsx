"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmDialog";
import { coins } from "@/lib/persian";
import { withdrawInvestmentAction } from "../actions";

/** پس‌گرفتن حمایتی که پیش از آخرین ویرایش ایده داده شده؛ سکه کامل به کیف برمی‌گردد. */
export function WithdrawButton({ ideaId, amount }: { ideaId: string; amount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  async function withdraw() {
    if (!(await confirm({ title: `${coins(amount)} حمایت را پس بگیرم؟`, body: "سکه کامل به کیفت برمی‌گردد و این حمایت از امتیاز تیم کم می‌شود.", confirmLabel: "پس بگیر" }))) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await withdrawInvestmentAction(ideaId);
        if (res.error) setError(res.error);
        else router.refresh();
      } catch {
        setError("ارتباط با سرور برقرار نشد؛ دوباره تلاش کن.");
      }
    });
  }

  return (
    <div className="space-y-2">
      {error && <Alert kind="error">{error}</Alert>}
      <Alert kind="info">
        این ایده بعد از حمایت تو ویرایش شده است. تاریخچهٔ تغییرات را ببین؛ اگر نظرت عوض شد می‌توانی {coins(amount)} حمایتت را پس بگیری.
      </Alert>
      <button type="button" onClick={withdraw} disabled={pending} className="btn-ghost w-full justify-center">
        {pending ? "در حال پس‌گرفتن…" : `پس‌گرفتن ${coins(amount)} حمایت`}
      </button>
    </div>
  );
}
