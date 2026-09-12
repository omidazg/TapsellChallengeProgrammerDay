import { requireUser } from "@/lib/auth";
import { getPhase, getSettingInt, phaseIndex } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { getIdeasForFloor } from "@/lib/idea";
import { totalInvestedByUser } from "@/lib/invest";
import { PageHeader, Container, Locked, Stat, Alert } from "@/components/ui";
import { coins } from "@/lib/persian";
import { InvestFloor } from "./InvestFloor";

export const metadata = { title: "طبقهٔ سرمایه‌گذاری" };

export default async function InvestPage() {
  const user = await requireUser();
  const { phase } = await getPhase();

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

  const [ideas, invested, penaltyPerCoin] = await Promise.all([
    getIdeasForFloor(),
    totalInvestedByUser(user.id),
    getSettingInt("penalty_per_coin", DEFAULTS.penaltyPerCoin),
  ]);

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
              سکه‌های بذر خرج‌نشده در پایان بازی جریمه می‌شوند (هر سکه {coins(penaltyPerCoin)} کسر امتیاز) — بذرت را کامل به کار بگیر.
            </Alert>
          </div>
        )}
        <InvestFloor ideas={ideas} ownTeamId={user.teamId} interactive={interactive} />
      </Container>
    </>
  );
}
