"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { claimHypeAction } from "./actions";

export function HypeClaim({ power, powerUsed }: { power: string; powerUsed: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (power !== "HYPE" || powerUsed) return null;

  return (
    <div className="card p-4 flex flex-wrap items-center justify-between gap-3 anim-pop">
      <div>
        <div className="font-black text-brand-navy">📣 قدرت «هیاهو»</div>
        <div className="text-sm text-brand-slate">اولین جایگاه «کارت محصول ویژه» باز را رایگان بگیر.</div>
      </div>
      <div className="flex items-center gap-3">
        {error && <Alert kind="error">{error}</Alert>}
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await claimHypeAction();
              if (res?.error) setError(res.error);
              else router.refresh();
            })
          }
          className="btn-primary !px-4 !py-2"
        >
          استفاده از قدرت
        </button>
      </div>
    </div>
  );
}
