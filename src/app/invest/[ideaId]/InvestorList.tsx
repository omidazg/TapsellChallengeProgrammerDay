import { Avatar } from "@/components/Avatar";
import { fa, coins, jdatetime } from "@/lib/persian";

type InvestorRow = { id: string; userId: string; nickname: string; avatarSeed: string; amount: number; createdAt: Date };

/** فهرست حمایت‌های یک ایده؛ تا پایان «دور حمایت» مبلغ‌ها (جز برای اعضای تیم) پنهان است. */
export function InvestorList({ investments, revealed }: { investments: InvestorRow[]; revealed: boolean }) {
  return (
    <div className="card p-6 anim-rise">
      <h3 className="font-black text-brand-navy mb-4">حامی‌ها ({fa(new Set(investments.map((i) => i.userId)).size)})</h3>
      {investments.length === 0 ? (
        <p className="text-sm text-brand-slate">هنوز کسی از این ایده حمایت نکرده است.</p>
      ) : (
        <ul className="space-y-3">
          {investments.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3">
              <Avatar seed={inv.avatarSeed || inv.userId} size={32} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-brand-navy truncate">{inv.nickname}</div>
                <div className="text-xs text-brand-slate">{jdatetime(inv.createdAt)}</div>
              </div>
              <span className="font-black text-brand-navy fa-num shrink-0">{revealed ? coins(inv.amount) : "پنهان"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
