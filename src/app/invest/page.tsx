import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getPhase, getSettingInt, phaseIndex, PHASE_LABEL } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { getIdeasForFloor, parseFloorFilter } from "@/lib/idea";
import { totalInvestedByUser } from "@/lib/invest";
import { spendableBuyCoins } from "@/lib/market";
import { PageHeader, Container, Locked, Stat, Alert } from "@/components/ui";
import { coins } from "@/lib/persian";
import { InvestFloor } from "./InvestFloor";
import { peopleExample } from "@/lib/people-example";

export const metadata = { title: "حمایت از ایده‌ها" };

export default async function InvestPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const { phase } = await getPhase();
  const sp = await searchParams;
  const aiOff = !process.env.ANTHROPIC_API_KEY;
  const filter = parseFloorFilter(sp.filter);

  if (phaseIndex(phase) < phaseIndex("SEED_ROUND")) {
    return (
      <>
        <PageHeader
          eyebrow={`از فاز «${PHASE_LABEL.SEED_ROUND}» باز می‌شود`}
          title="حمایت از ایده‌ها"
          action={
            <Link href="/" className="btn-ghost">
              الان چه کنم؟
            </Link>
          }
        />
        <Container>
          <h2 className="sr-only">وضعیت حمایت</h2>
          <Locked title="هنوز زود است" desc={`حمایت از ایده‌ها از فاز «${PHASE_LABEL.SEED_ROUND}» باز می‌شود.`} />
        </Container>
      </>
    );
  }

  const [ideas, invested, spendable, supportCap] = await Promise.all([
    getIdeasForFloor(filter),
    totalInvestedByUser(user.id),
    spendableBuyCoins(user.id, user.buyWallet),
    getSettingInt("support_cap", DEFAULTS.supportCap),
  ]);

  const interactive = phase === "SEED_ROUND";

  return (
    <>
      <PageHeader
        eyebrow={interactive ? "فاز فعلی" : PHASE_LABEL.SEED_ROUND}
        title="حمایت از ایده‌ها"
        desc="با سکه‌هایت از ایده‌هایی که دوست داری حمایت کن تا تیمشان امتیاز «حمایت مردمی» بگیرد."
        action={
          <div className="flex flex-wrap gap-3">
            <Stat label="سکهٔ قابل‌خرج" value={coins(spendable)} tone="gold" />
            <Stat label="حمایت‌های من" value={coins(invested)} tone="cyan" />
          </div>
        }
      />
      <Container>
        {!interactive && (
          <div className="mb-6">
            <Alert kind="info">«{PHASE_LABEL.SEED_ROUND}» تمام شده است؛ این صفحه فقط برای مشاهده است.</Alert>
          </div>
        )}
        <div className="mb-6">
          <Alert kind="info">
            <b>تعداد حامی‌ها مهم‌تر از مبلغ است:</b> {peopleExample(supportCap)}
            از هر نفر حداکثر {coins(supportCap)} برای هر پروژه در امتیاز حساب می‌شود. حمایت از ایدهٔ تیم خودت ممکن نیست.
            {interactive && (
              <>
                {" "}
                سکهٔ بیشتر می‌خواهی؟{" "}
                <Link href="/coins" className="font-bold underline underline-offset-4">
                  خرید سکه
                </Link>
              </>
            )}
          </Alert>
        </div>
        {/* کارت هر ایده h3 دارد؛ این h2 پنهان ترتیب سرتیترها را درست نگه می‌دارد */}
        <h2 className="sr-only">فهرست ایده‌ها</h2>
        <InvestFloor ideas={ideas} ownTeamId={user.teamId} interactive={interactive} filter={filter} aiOff={aiOff} />
      </Container>
    </>
  );
}
