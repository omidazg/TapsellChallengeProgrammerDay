import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSettingInt } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { getIdeasForFloor, parseFloorFilter } from "@/lib/idea";
import { totalInvestedByUser } from "@/lib/invest";
import { spendableBuyCoins } from "@/lib/market";
import { moduleStatusFor } from "@/lib/module-state";
import { listVisibleTracks } from "@/lib/track-data";
import { PageHeader, Container, Stat, Alert } from "@/components/ui";
import { ModuleClosed, ModuleReadOnly } from "@/components/ModuleState";
import { TrackSwitcher } from "@/components/TrackSwitcher";
import { coins } from "@/lib/persian";
import { InvestFloor } from "./InvestFloor";
import { peopleExample } from "@/lib/people-example";

export const metadata = { title: "حمایت از ایده‌ها" };

const TITLE = "حمایت از ایده‌ها";

export default async function InvestPage({ searchParams }: { searchParams: Promise<{ filter?: string; track?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const aiOff = !process.env.ANTHROPIC_API_KEY;
  const filter = parseFloorFilter(sp.filter);

  const status = await moduleStatusFor("invest", user.teamId);
  if (status === "hidden") notFound();
  if (status === "closed") return <ModuleClosed moduleKey="invest" title={TITLE} />;

  const tracks = await listVisibleTracks();
  const trackId = tracks.find((t) => t.id === sp.track)?.id ?? null;
  const [ideas, invested, spendable, supportCap] = await Promise.all([
    getIdeasForFloor(filter, trackId ?? undefined),
    totalInvestedByUser(user.id),
    spendableBuyCoins(user.id, user.buyWallet),
    getSettingInt("support_cap", DEFAULTS.supportCap),
  ]);

  const interactive = status === "open";
  const hrefFor = (id: string | null) => {
    const q = new URLSearchParams();
    if (filter !== "all") q.set("filter", filter);
    if (id) q.set("track", id);
    const s = q.toString();
    return s ? `/invest?${s}` : "/invest";
  };

  return (
    <>
      <PageHeader
        title={TITLE}
        desc="با سکه‌هایت از ایده‌هایی که دوست داری حمایت کن؛ حمایت بخشی از امتیاز بازار آن تیم می‌شود. نظر تحلیل‌گر هوش مصنوعی روی هر ایده هم کمکت می‌کند بهتر انتخاب کنی."
        action={
          <div className="flex flex-wrap gap-3">
            <Stat label="سکهٔ قابل‌خرج" value={coins(spendable)} tone="gold" />
            <Stat label="حمایت‌های من" value={coins(invested)} tone="cyan" />
          </div>
        }
      />
      <Container className="space-y-6">
        {status === "ro" && <ModuleReadOnly moduleKey="invest" />}
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
        <TrackSwitcher tracks={tracks} current={trackId} hrefFor={hrefFor} allLabel="همهٔ محورها" />
        {/* کارت هر ایده h3 دارد؛ این h2 پنهان ترتیب سرتیترها را درست نگه می‌دارد */}
        <h2 className="sr-only">فهرست ایده‌ها</h2>
        <InvestFloor ideas={ideas} ownTeamId={user.teamId} interactive={interactive} filter={filter} trackId={trackId} aiOff={aiOff} />
      </Container>
    </>
  );
}
