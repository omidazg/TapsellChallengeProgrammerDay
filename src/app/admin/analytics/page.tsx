import { requireAdmin } from "@/lib/auth";
import { getAnalytics, type HourlyBucket, type SpendBucket } from "@/lib/analytics";
import { PageHeader, Container, Stat } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";

export const metadata = { title: "تحلیل مشارکت · پنل برگزارکننده" };

export default async function AdminAnalyticsPage() {
  await requireAdmin();
  const data = await getAnalytics();
  const { participation, spend, hourly, survey } = data;

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="تحلیل مشارکت" desc="مشارکت، نرخ خرج سکه، اوج فعالیت و نتیجهٔ نظرسنجی." />
      <Container className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-black text-brand-navy">مشارکت</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="ثبت‌نامی" value={fa(participation.registered)} />
            <Stat label="عضو تیم" value={fa(participation.inTeam.count)} hint={`${fa(participation.inTeam.pct)}٪`} />
            <Stat label="سرمایه‌گذار" value={fa(participation.investors.count)} hint={`${fa(participation.investors.pct)}٪`} tone="cyan" />
            <Stat label="خریدار" value={fa(participation.buyers.count)} hint={`${fa(participation.buyers.pct)}٪`} tone="cyan" />
            <Stat label="پیشنهاددهندهٔ حراج" value={fa(participation.bidders.count)} hint={`${fa(participation.bidders.pct)}٪`} tone="red" />
            <Stat label="قلب‌دهنده" value={fa(participation.hearters.count)} hint={`${fa(participation.hearters.pct)}٪`} tone="red" />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-black text-brand-navy">نرخ خرج سکه</h2>
          <p className="mb-3 text-xs text-brand-slate">
            چون کیف اولیهٔ هر کاربر در پایگاه‌داده جداگانه ذخیره نشده، مقدار فعلی تنظیمات «کیف بذر/خرید اولیه» به‌عنوان مبنای همهٔ کاربران فرض شده است.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            <SpendPanel title="کیف بذر" pct={spend.seed.spentPct} buckets={spend.seed.buckets} />
            <SpendPanel title="کیف خرید" pct={spend.buy.spentPct} buckets={spend.buy.buckets} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-black text-brand-navy">اوج فعالیت (ساعتی)</h2>
          <div className="card p-4">
            <HourlyChart data={hourly} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-black text-brand-navy">نظرسنجی پایان بازی</h2>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <Stat label="تعداد پاسخ" value={fa(survey.count)} />
            <Stat label="میانگین رضایت کلی" value={fa(survey.averages.rating)} tone="cyan" />
            <Stat label="میانگین سرگرمی" value={fa(survey.averages.fun)} tone="cyan" />
          </div>
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <DistPanel title="رضایت کلی" dist={survey.distributions.rating} />
            <DistPanel title="سرگرمی" dist={survey.distributions.fun} />
            <DistPanel title="یادگیری" dist={survey.distributions.learned} />
          </div>
          <h3 className="mb-2 text-sm font-black text-brand-navy">آخرین نظرها</h3>
          {survey.latestComments.length === 0 ? (
            <p className="text-sm text-brand-slate">هنوز نظری ثبت نشده.</p>
          ) : (
            <ul className="space-y-2">
              {survey.latestComments.map((c, i) => (
                <li key={i} className="card p-3">
                  <div className="text-xs font-bold text-brand-navy">{c.nickname}</div>
                  <div className="mt-1 text-sm text-brand-slate break-words">{c.comment}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Container>
    </>
  );
}

function SpendPanel({ title, pct, buckets }: { title: string; pct: number; buckets: SpendBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-sm font-bold text-brand-navy">{title}</span>
        <span className="text-lg font-black text-brand-cyan-dark fa-num">{fa(pct)}٪ خرج‌شده</span>
      </div>
      <ul className="space-y-2">
        {buckets.map((b) => (
          <li key={b.label} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-brand-slate fa-num">{b.label}</span>
            <span className="flex-1 h-3 rounded-full bg-brand-mist overflow-hidden">
              <span className="block h-full rounded-full bg-brand-cyan-dark" style={{ width: `${(b.count / max) * 100}%` }} />
            </span>
            <span className="w-6 shrink-0 text-left text-xs font-bold text-brand-navy fa-num">{fa(b.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DistPanel({ title, dist }: { title: string; dist: number[] }) {
  const max = Math.max(1, ...dist);
  return (
    <div className="card p-4">
      <div className="mb-2 text-sm font-bold text-brand-navy">{title}</div>
      <ul className="space-y-1.5">
        {dist.map((count, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-4 shrink-0 text-xs text-brand-slate fa-num">{fa(i + 1)}</span>
            <span className="flex-1 h-2.5 rounded-full bg-brand-mist overflow-hidden">
              <span className="block h-full rounded-full bg-brand-red" style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <span className="w-5 shrink-0 text-left text-xs font-bold text-brand-navy fa-num">{fa(count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HourlyChart({ data }: { data: HourlyBucket[] }) {
  if (data.length === 0) return <p className="text-sm text-brand-slate">هنوز رخدادی ثبت نشده.</p>;

  const max = Math.max(1, ...data.map((d) => d.count));
  const barW = 18;
  const gap = 6;
  const chartH = 120;
  const w = data.length * (barW + gap);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${chartH}`} className="w-full h-32" role="img" aria-hidden="true" preserveAspectRatio="none">
        {data.map((d, i) => {
          const barH = Math.max(1, (d.count / max) * (chartH - 4));
          const x = i * (barW + gap);
          const y = chartH - barH;
          return <rect key={i} x={x} y={y} width={barW} height={barH} rx={3} fill="var(--color-brand-cyan-dark)" />;
        })}
      </svg>
      <table className="sr-only">
        <caption>فعالیت ساعتی بازی (سرمایه‌گذاری، خرید، پیشنهاد حراج و قلب)</caption>
        <thead>
          <tr>
            <th>ساعت</th>
            <th>تعداد رخداد</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td>{jdatetime(d.hourStart)}</td>
              <td>{fa(d.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
