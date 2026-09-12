import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULTS, POWERS } from "@/lib/constants";
import { LEDGER_REASON_LABEL, WALLET_LABEL, getSettingFloat } from "@/lib/scoring";
import { defaultConfig, unspentPenalty } from "@/lib/economy/engine";
import { PageHeader, Container, Stat, Alert, Empty } from "@/components/ui";
import { fa, coins, jdatetime } from "@/lib/persian";
import { ShieldButton } from "./ShieldButton";

export const metadata = { title: "کیف پول" };

export default async function WalletPage() {
  const user = await requireUser();
  const penaltyPerCoin = await getSettingFloat("penalty_per_coin", DEFAULTS.penaltyPerCoin);

  const [userLedger, treasuryLedger, team] = await Promise.all([
    prisma.ledgerEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    user.teamId
      ? prisma.ledgerEntry.findMany({ where: { teamId: user.teamId, wallet: "TREASURY" }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    user.teamId ? prisma.team.findUnique({ where: { id: user.teamId } }) : Promise.resolve(null),
  ]);

  const leftover = user.seedWallet + user.buyWallet;
  const hasShield = user.power === "SHIELD";
  const shieldUsed = hasShield && user.powerUsed;
  const shielded = shieldUsed ? Math.min(10, leftover) : 0;
  // همان محاسبهٔ موتور اقتصاد تا پیش‌نمایش با امتیاز نهایی یکی باشد
  const penaltyPreview = unspentPenalty({ ...defaultConfig(), penaltyPerCoin }, [
    { userId: user.id, teamId: user.teamId, seedLeft: user.seedWallet, buyLeft: user.buyWallet, shieldUsed },
  ]);

  return (
    <>
      <PageHeader eyebrow="کیف پول" title="کیف پول تو" desc="کیف بذر برای سرمایه‌گذاری در ایده‌ها، کیف خرید برای بازار روز بازار." />
      <Container className="space-y-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          <Stat label="🌱 کیف بذر" value={coins(user.seedWallet)} hint="برای سرمایه‌گذاری روی ایده‌های دیگر تیم‌ها" tone="cyan" />
          <Stat label="🛒 کیف خرید" value={coins(user.buyWallet)} hint="برای خرید محصول در روز بازار" tone="red" />
          {team && <Stat label="🏦 خزانهٔ تیم" value={coins(team.treasury)} hint="سرمایهٔ جذب‌شدهٔ تیم" tone="navy" />}
        </div>

        <div className="card p-6 anim-rise">
          <h2 className="text-lg font-black text-brand-navy mb-1">پیش‌نمایش جریمه</h2>
          <p className="text-sm text-brand-slate mb-4">
            هر سکهٔ خرج‌نشده در پایان بازی {fa(penaltyPerCoin)} امتیاز از امتیاز تیم کم می‌کند.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-3xl font-black text-brand-red fa-num">{fa(Math.round(penaltyPreview * 10) / 10)} امتیاز</div>
            <div className="text-xs text-brand-slate">
              بر اساس {coins(leftover)} باقی‌مانده {shielded > 0 && <>(با کسر {coins(shielded)} به‌خاطر سپر)</>}
            </div>
          </div>
          {hasShield && !user.powerUsed && (
            <div className="mt-4 pt-4 border-t border-brand-mist">
              <p className="text-sm text-brand-navy mb-2">
                {POWERS.SHIELD.emoji} قدرت تو «{POWERS.SHIELD.label}» است: {POWERS.SHIELD.desc}
              </p>
              <ShieldButton />
            </div>
          )}
          {hasShield && user.powerUsed && <Alert kind="ok">سپر فعال است؛ ۱۰ سکه از جریمهٔ خرج‌نشدهٔ تو معاف است.</Alert>}
        </div>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-3">دفتر کل تراکنش‌های من</h2>
          <LedgerTable entries={userLedger} />
        </section>

        {team && (
          <section>
            <h2 className="text-lg font-black text-brand-navy mb-3">دفتر کل خزانهٔ تیم</h2>
            <LedgerTable entries={treasuryLedger} />
          </section>
        )}
      </Container>
    </>
  );
}

function LedgerTable({ entries }: { entries: { id: string; wallet: string; delta: number; reason: string; createdAt: Date }[] }) {
  if (entries.length === 0) return <Empty title="هنوز تراکنشی ثبت نشده" />;
  return (
    <div className="card overflow-x-auto anim-rise">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-right text-brand-slate border-b border-brand-mist">
            <th className="px-4 py-3 font-bold">کیف</th>
            <th className="px-4 py-3 font-bold">دلیل</th>
            <th className="px-4 py-3 font-bold">تغییر</th>
            <th className="px-4 py-3 font-bold">زمان</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-brand-mist last:border-0">
              <td className="px-4 py-3">{WALLET_LABEL[e.wallet] ?? e.wallet}</td>
              <td className="px-4 py-3">{LEDGER_REASON_LABEL[e.reason] ?? e.reason}</td>
              <td className={`px-4 py-3 font-black fa-num ${e.delta >= 0 ? "text-emerald-600" : "text-brand-red"}`}>
                {e.delta >= 0 ? "+" : ""}
                {fa(e.delta)}
              </td>
              <td className="px-4 py-3 text-brand-slate">{jdatetime(e.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
