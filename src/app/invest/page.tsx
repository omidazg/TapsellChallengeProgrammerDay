import { requireUser } from "@/lib/auth";
import { getPhase, getSetting, phaseIndex } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { getIdeasForFloor, parseFloorFilter } from "@/lib/idea";
import { totalInvestedByUser } from "@/lib/invest";
import { PageHeader, Container, Locked, Stat, Alert } from "@/components/ui";
import { UnspentReminder } from "@/components/UnspentReminder";
import { fa, coins } from "@/lib/persian";
import { InvestFloor } from "./InvestFloor";

export const metadata = { title: "طبقهٔ سرمایه‌گذاری" };

export default async function InvestPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const { phase, endsAt } = await getPhase();
  const sp = await searchParams;
  const aiOff = !process.env.ANTHROPIC_API_KEY;
  const filter = parseFloorFilter(sp.filter);

  if (phaseIndex(phase) < phaseIndex("SEED_ROUND")) {
    return (
      <>
        <PageHeader eyebrow="فاز فعلی" title="طبقهٔ سرمایه‌گذاری" />
        <Container>
          <Locked title="هنوز زود است" desc="طبقهٔ سرمایه‌گذاری از فاز «دور سرمایه‌گذاری» باز می‌شود." />
        </Container>
      </>
    );
  }

  const [ideas, invested, penaltyRaw] = await Promise.all([
    getIdeasForFloor(filter),
    totalInvestedByUser(user.id),
    // جریمه اعشاری است (پیش‌فرض ۱٫۵) پس نباید با getSettingInt خوانده شود.
    getSetting("penalty_per_coin", String(DEFAULTS.penaltyPerCoin)),
  ]);
  const parsedPenalty = Number.parseFloat(penaltyRaw);
  const penaltyPerCoin = Number.isFinite(parsedPenalty) ? parsedPenalty : DEFAULTS.penaltyPerCoin;

  const interactive = phase === "SEED_ROUND";

  return (
    <>
      <PageHeader
        eyebrow="فاز فعلی"
        title="طبقهٔ سرمایه‌گذاری"
        desc="با کیف بذر روی ایده‌های تیم‌های دیگر سرمایه‌گذاری کن و در سود آن‌ها شریک شو."
        action={
          <div className="flex flex-wrap gap-3">
            <Stat label="کیف بذر" value={coins(user.seedWallet)} tone="gold" />
            <Stat label="سرمایه‌گذاری‌شده" value={coins(invested)} tone="cyan" />
          </div>
        }
      />
      <Container>
        {!interactive && (
          <div className="mb-6">
            <Alert kind="info">دور سرمایه‌گذاری تمام شده است؛ این صفحه فقط برای مشاهده است.</Alert>
          </div>
        )}
        {interactive && (
          <div className="mb-6">
            <Alert kind="error">
              سکه‌های بذر خرج‌نشده در پایان بازی جریمه می‌شوند (به ازای هر سکه {fa(penaltyPerCoin)} امتیاز کسر) — بذرت را کامل به کار بگیر.
            </Alert>
          </div>
        )}
        {interactive && (
          <div className="mb-6">
            <UnspentReminder
              phase={phase}
              phaseLabel="فاز «دور سرمایه‌گذاری»"
              endsAt={endsAt ? endsAt.toISOString() : null}
              coinsLeft={user.seedWallet}
              penaltyPerCoin={DEFAULTS.penaltyPerCoin}
            />
          </div>
        )}
        <InvestFloor ideas={ideas} ownTeamId={user.teamId} interactive={interactive} filter={filter} aiOff={aiOff} />
      </Container>
    </>
  );
}
