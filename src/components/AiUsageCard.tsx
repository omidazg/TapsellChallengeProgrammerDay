import { dailyBudgetUsd, getUsage, tehranDayKey } from "@/lib/ai-budget";
import { fa } from "@/lib/persian";

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${fa(Math.round(n / 100_000) / 10)}M`;
  if (n >= 1_000) return `${fa(Math.round(n / 100) / 10)}K`;
  return fa(n);
}

/** کارت مصرف امروز هوش مصنوعی؛ برای صفحهٔ ادمین (تعداد فراخوانی، توکن‌ها، هزینه در برابر بودجه). */
export async function AiUsageCard() {
  const budget = dailyBudgetUsd();
  const usage = await getUsage();
  const pct = budget > 0 ? Math.min(100, Math.round((usage.costUsd / budget) * 100)) : 0;
  const over = usage.costUsd >= budget;

  return (
    <div className="card p-6 anim-rise">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📊</span>
        <h3 className="font-black text-brand-navy">مصرف هوش مصنوعی امروز</h3>
        <span className="text-xs text-brand-slate/70 fa-num">({tehranDayKey()})</span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4 text-center">
        <div>
          <div className="text-lg font-black text-brand-navy fa-num">{fa(usage.calls)}</div>
          <div className="text-xs text-brand-slate">فراخوانی</div>
        </div>
        <div>
          <div className="text-lg font-black text-brand-navy fa-num">
            {fmtTokens(usage.inputTokens + usage.outputTokens + usage.cacheWriteTokens + usage.cacheReadTokens)}
          </div>
          <div className="text-xs text-brand-slate">توکن کل</div>
        </div>
        <div>
          <div className="text-lg font-black text-brand-navy fa-num">{fmtTokens(usage.cacheReadTokens)}</div>
          <div className="text-xs text-brand-slate">توکن کش‌خوانی</div>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs font-bold text-brand-slate mb-1">
          <span>هزینه امروز</span>
          <span className="fa-num">
            {fmtUsd(usage.costUsd)} از {fmtUsd(budget)}
          </span>
        </div>
        <div className="h-2.5 rounded-pill bg-brand-sky overflow-hidden">
          <div className={`h-full rounded-pill ${over ? "bg-brand-red" : "bg-brand-cyan"}`} style={{ width: `${pct}%` }} />
        </div>
        {over && <p className="mt-2 text-xs font-bold text-brand-red">بودجهٔ روزانه پر شده؛ فراخوانی‌های جدید هوش مصنوعی امروز مسدودند.</p>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-brand-slate">
        <div>ورودی: <span className="fa-num">{fmtTokens(usage.inputTokens)}</span></div>
        <div>خروجی: <span className="fa-num">{fmtTokens(usage.outputTokens)}</span></div>
        <div>کش‌نویسی: <span className="fa-num">{fmtTokens(usage.cacheWriteTokens)}</span></div>
        <div>کش‌خوانی: <span className="fa-num">{fmtTokens(usage.cacheReadTokens)}</span></div>
      </div>
    </div>
  );
}
