import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POWERS } from "@/lib/constants";
import { LEDGER_REASON_LABEL, WALLET_LABEL, personalPenalty } from "@/lib/scoring";
import { getEffectiveGameValues } from "@/lib/game-values";
import { PageHeader, Container, Stat, Empty, Alert } from "@/components/ui";
import { fa, coins, jdatetime } from "@/lib/persian";
import { getPhase, phaseAtLeast, PHASE_LABEL } from "@/lib/phase";
import { shieldCandidates, shieldMaxCredit, shieldPhaseAllowed } from "@/lib/shield";
import { ShieldPicker } from "./ShieldPicker";

export const metadata = { title: "کیف پول" };

export default async function WalletPage() {
  const user = await requireUser();
  // جریمه و سقف مؤثر (تنظیم برگزارکننده یا پیش‌فرض) با یک کوئری
  const { penaltyPerCoin, maxPerTarget } = await getEffectiveGameValues();

  const [userLedger, treasuryLedger, team, now] = await Promise.all([
    prisma.ledgerEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    user.teamId
      ? prisma.ledgerEntry.findMany({ where: { teamId: user.teamId, wallet: "TREASURY" }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    user.teamId ? prisma.team.findUnique({ where: { id: user.teamId } }) : Promise.resolve(null),
    personalPenalty(user.id),
  ]);

  const leftover = user.seedWallet + user.buyWallet;
  const hasShield = user.power === "SHIELD"; // سپر یک‌بار و دستی روی یک سرمایه‌گذاری انتخاب می‌شود
  const shield = hasShield ? await loadShieldState(user.id, user.shieldTeamId) : null;
  // «الان»: همان محاسبهٔ امتیازدهی پایانی روی وضعیت فعلی (فقط سکه‌ای که واقعاً قابل‌خرج است).
  // «حداکثر»: اگر هیچ‌کدام از سکه‌ها خرج نشود؛ پیش از روز بازار که هنوز محصولی ثبت نشده،
  // عدد «الان» گمراه‌کننده صفر است، پس هر دو را نشان می‌دهیم.
  const maxPenalty = penaltyPerCoin * leftover;
  const round1 = (n: number) => Math.round(n * 10) / 10;

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
            هر سکهٔ خرج‌نشده در پایان بازی {fa(penaltyPerCoin)} امتیاز از امتیاز تیمت کم می‌کند؛ اما فقط سکه‌ای که
            واقعاً می‌شد خرجش کرد. اگر به سقف {fa(maxPerTarget)}‌سکه‌ای همهٔ هدف‌ها رسیده باشی، یا باقی‌ماندهٔ
            کیف خریدت از قیمت محصولات کمتر باشد، آن سکه‌ها جریمه نمی‌شوند.
          </p>
          {round1(now.penalty) === 0 ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-3xl font-black text-emerald-600 fa-num">بدون جریمه</div>
              <div className="text-xs text-brand-slate">
                {leftover === 0 || round1(maxPenalty) === 0
                  ? "الان جریمه‌ای نداری و سکهٔ خرج‌نشده‌ای هم باقی نمانده است."
                  : `الان جریمه‌ای نداری؛ اما اگر ${coins(leftover)} باقی‌مانده‌ات خرج نشود، تا ${fa(round1(maxPenalty))} امتیاز کم می‌شود.`}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="text-xs text-brand-slate">اگر بازی همین الان تمام شود</div>
                <div className="text-3xl font-black text-brand-red fa-num">{fa(round1(now.penalty))} امتیاز</div>
              </div>
              <div className="text-xs text-brand-slate">
                {coins(now.spendable)} از {coins(leftover)} باقی‌مانده‌ات هنوز خرج‌شدنی است. اگر هیچ‌کدام را خرج نکنی و
                بازار پر از محصول شود، جریمه تا {fa(round1(maxPenalty))} امتیاز می‌رسد.
              </div>
            </div>
          )}
        </div>

        {shield && (
          <div className="card p-6 anim-rise space-y-3">
            <h2 className="text-lg font-black text-brand-navy">
              {POWERS.SHIELD.emoji} قدرت «{POWERS.SHIELD.label}»
            </h2>
            <p className="text-sm text-brand-slate">{POWERS.SHIELD.desc}</p>
            {shield.chosen ? (
              <Alert kind="ok">
                سپر روی سرمایه‌گذاری‌ات در «{shield.chosen.teamName}» ({coins(shield.chosen.invested)}) نشسته است. اگر سود این
                سرمایه‌گذاری کمتر از {coins(shieldMaxCredit(shield.chosen.invested))} شود، در امتیاز پرتفوی تیمت همین{" "}
                {coins(shieldMaxCredit(shield.chosen.invested))} حساب می‌شود. این انتخاب نهایی است و قابل تغییر نیست.
              </Alert>
            ) : shield.open ? (
              <>
                <p className="text-sm text-brand-navy">
                  تا پیش از شروع «{PHASE_LABEL.MARKET}» یکی از سرمایه‌گذاری‌هایت را انتخاب کن. فقط یک‌بار می‌توانی انتخاب کنی
                  و بعد از آن قابل تغییر نیست.
                </p>
                <ShieldPicker
                  candidates={shield.candidates.map((c) => ({ ...c, maxCredit: shieldMaxCredit(c.invested) }))}
                />
              </>
            ) : (
              <Alert kind="info">
                {shield.tooEarly
                  ? `انتخاب سپر از «${PHASE_LABEL.SEED_ROUND}» باز می‌شود و تا پیش از «${PHASE_LABEL.MARKET}» فرصت داری.`
                  : `مهلت انتخاب سپر (تا پیش از «${PHASE_LABEL.MARKET}») تمام شده و سپری انتخاب نکردی؛ این قدرت بی‌اثر ماند.`}
              </Alert>
            )}
          </div>
        )}

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

/**
 * وضعیت قدرت سپر برای کیف پول: یا هدف انتخاب‌شده، یا (در فاز مجاز) فهرست سرمایه‌گذاری‌های
 * واجد شرایط، یا دلیل بسته بودن انتخاب.
 */
async function loadShieldState(userId: string, shieldTeamId: string | null) {
  if (shieldTeamId) {
    const [team, agg] = await Promise.all([
      prisma.team.findUnique({ where: { id: shieldTeamId }, select: { name: true } }),
      prisma.investment.aggregate({
        where: { userId, selfFunded: false, idea: { teamId: shieldTeamId } },
        _sum: { amount: true },
      }),
    ]);
    return {
      chosen: { teamName: team?.name ?? "", invested: agg._sum.amount ?? 0 },
      open: false,
      tooEarly: false,
      candidates: [],
    };
  }
  const { phase } = await getPhase();
  const open = shieldPhaseAllowed(phase);
  return {
    chosen: null,
    open,
    tooEarly: !phaseAtLeast(phase, "SEED_ROUND"),
    candidates: open ? await shieldCandidates(userId) : [],
  };
}

function LedgerTable({ entries }: { entries: { id: string; wallet: string; delta: number; reason: string; createdAt: Date }[] }) {
  if (entries.length === 0) return <Empty title="هنوز تراکنشی ثبت نشده" />;
  return (
    <div className="card overflow-x-auto anim-rise">
      <table className="w-full text-sm">
        <caption className="sr-only">دفتر کل تراکنش‌ها</caption>
        <thead>
          <tr className="text-right text-brand-slate border-b border-brand-mist">
            <th scope="col" className="px-4 py-3 font-bold">کیف</th>
            <th scope="col" className="px-4 py-3 font-bold">دلیل</th>
            <th scope="col" className="px-4 py-3 font-bold">تغییر</th>
            <th scope="col" className="px-4 py-3 font-bold">زمان</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-brand-mist last:border-0">
              <td className="px-4 py-3">{WALLET_LABEL[e.wallet] ?? e.wallet}</td>
              <td className="px-4 py-3">{LEDGER_REASON_LABEL[e.reason] ?? e.reason}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-black fa-num ${
                    e.delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-brand-red"
                  }`}
                >
                  {/* علامت منهای فارسی (U+2212) تا در متن راست‌چین وارونه دیده نشود */}
                  <span aria-hidden>{e.delta >= 0 ? "+" : "−"}</span>
                  {fa(Math.abs(e.delta))}
                </span>
              </td>
              <td className="px-4 py-3 text-brand-slate">{jdatetime(e.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
