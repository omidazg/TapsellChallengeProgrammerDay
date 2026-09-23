"use client";

import { useId, useMemo, useState } from "react";
import { fa, jtime } from "@/lib/persian";

export interface TrendTeamSeries {
  teamId: string;
  name: string;
  sales: number[];
  capital: number[];
}

interface TrendChartProps {
  /** زمان پایان هر سطل (epoch ms)، هم‌طول با هر آرایهٔ sales/capital */
  bucketEndsAt: number[];
  /** حداکثر ۶ تیم برتر (از قبل فیلتر/مرتب‌شده توسط صفحهٔ فراخواننده) */
  teams: TrendTeamSeries[];
}

// رنگ‌های ثابت و قابل‌تشخیص برای افراد کم‌بینای رنگ (پالت Okabe–Ito)، به‌صورت متغیر CSS
// تعریف‌شده داخل همین کامپوننت (نه globals.css) تا مرز مالکیت فایل‌ها رعایت شود.
// نسخهٔ حالت تیره با [data-theme="dark"] هم‌سو با مکانیزم تم پروژه (theme.css) بازنویسی می‌شود.
const CHART_COLOR_VARS = ["--tc-1", "--tc-2", "--tc-3", "--tc-4", "--tc-5", "--tc-6"];

const CHART_W = 720;
const CHART_H = 320;
const PAD_LEFT = 56;
const PAD_RIGHT = 96; // جا برای برچسب انتهای خط
const PAD_TOP = 16;
const PAD_BOTTOM = 36;

type Metric = "sales" | "capital";

/** نمودار خطی SVG روند فروش/سرمایه — بدون وابستگی به کتابخانهٔ نمودار.
 * توجه: با اینکه صفحه RTL است، محور زمان همیشه از چپ به راست پیش می‌رود (قرارداد متعارف نمودارهای زمانی)؛
 * فقط متن‌ها (برچسب‌ها، عنوان) فارسی و راست‌به‌چپ می‌مانند.
 */
export function TrendChart({ bucketEndsAt, teams }: TrendChartProps) {
  const [metric, setMetric] = useState<Metric>("sales");
  const titleId = useId();
  const descId = useId();

  const series = useMemo(() => teams.slice(0, 6), [teams]);

  const maxValue = useMemo(() => {
    let m = 0;
    for (const t of series) {
      const arr = metric === "sales" ? t.sales : t.capital;
      for (const v of arr) if (v > m) m = v;
    }
    return m || 1;
  }, [series, metric]);

  const n = bucketEndsAt.length;
  const xAt = (i: number) => (n <= 1 ? PAD_LEFT : PAD_LEFT + ((CHART_W - PAD_LEFT - PAD_RIGHT) * i) / (n - 1));
  const yAt = (v: number) => PAD_TOP + (CHART_H - PAD_TOP - PAD_BOTTOM) * (1 - v / maxValue);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxValue * f));
  // فقط چند برچسب زمانی (نه همهٔ سطل‌ها) تا محور شلوغ نشود
  const xTickIdx = n <= 1 ? [] : [0, Math.floor((n - 1) / 2), n - 1];

  const metricLabel = metric === "sales" ? "فروش" : "سرمایهٔ جذب‌شده";

  if (n === 0 || series.length === 0) {
    return (
      <div className="card p-5 text-sm text-brand-slate">هنوز رویدادی برای رسم نمودار روند ثبت نشده است.</div>
    );
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-brand-navy">روند {metricLabel} تیم‌های برتر</h3>
        <div role="radiogroup" aria-label="معیار نمودار" className="inline-flex rounded-full border border-brand-mist p-1 text-xs font-bold">
          <button
            type="button"
            role="radio"
            aria-checked={metric === "sales"}
            onClick={() => setMetric("sales")}
            className={`px-3 py-1.5 rounded-full transition ${metric === "sales" ? "bg-brand-navy text-white" : "text-brand-slate"}`}
          >
            فروش
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={metric === "capital"}
            onClick={() => setMetric("capital")}
            className={`px-3 py-1.5 rounded-full transition ${metric === "capital" ? "bg-brand-navy text-white" : "text-brand-slate"}`}
          >
            سرمایه
          </button>
        </div>
      </div>

      <style
        // متغیرهای رنگ نمودار؛ هم روشن هم تیره، محدود به همین کامپوننت (کلاس trend-chart-colors)
        dangerouslySetInnerHTML={{
          __html: `
          .trend-chart-colors {
            --tc-1: #0072B2; --tc-2: #D55E00; --tc-3: #009E73;
            --tc-4: #CC79A7; --tc-5: #E69F00; --tc-6: #56B4E9;
          }
          [data-theme="dark"] .trend-chart-colors {
            --tc-1: #6fb8e8; --tc-2: #ff9f5a; --tc-3: #4fe0b8;
            --tc-4: #eaa7d6; --tc-5: #ffcf5c; --tc-6: #8fd6ff;
          }
        `,
        }}
      />

      <div className="trend-chart-colors" dir="ltr">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          className="w-full h-auto"
        >
          <title id={titleId}>نمودار روند {metricLabel} تیم‌های برتر در طول بازی</title>
          <desc id={descId}>
            نمودار خطی {metricLabel} تجمعی {fa(series.length)} تیم برتر در {fa(n)} بازهٔ زمانی؛ داده‌های کامل در جدول
            زیر نمودار موجود است.
          </desc>

          {/* خطوط راهنمای افقی + برچسب محور y (سکه) */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line
                x1={PAD_LEFT}
                x2={CHART_W - PAD_RIGHT}
                y1={yAt(v)}
                y2={yAt(v)}
                stroke="var(--line, #d7effc)"
                strokeWidth={1}
              />
              <text x={PAD_LEFT - 8} y={yAt(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted, #4c6a7d)">
                {fa(v)}
              </text>
            </g>
          ))}

          {/* برچسب‌های محور زمان */}
          {xTickIdx.map((i) => (
            <text
              key={i}
              x={xAt(i)}
              y={CHART_H - PAD_BOTTOM + 18}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted, #4c6a7d)"
            >
              {jtime(new Date(bucketEndsAt[i]))}
            </text>
          ))}

          {/* خطوط تیم‌ها */}
          {series.map((t, idx) => {
            const arr = metric === "sales" ? t.sales : t.capital;
            const points = arr.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
            const color = `var(${CHART_COLOR_VARS[idx % CHART_COLOR_VARS.length]})`;
            const lastX = xAt(arr.length - 1);
            const lastY = yAt(arr[arr.length - 1] ?? 0);
            return (
              <g key={t.teamId}>
                <polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={lastX} cy={lastY} r={3.5} fill={color} />
                <text x={lastX + 6} y={lastY + 4} fontSize={11} fontWeight={700} fill={color}>
                  {t.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* جایگزین قابل‌دسترس برای صفحه‌خوان‌ها: همان داده به‌صورت جدول */}
      <table className="sr-only">
        <caption>جدول دادهٔ نمودار روند {metricLabel} (جایگزین نسخهٔ گرافیکی)</caption>
        <thead>
          <tr>
            <th scope="col">تیم</th>
            {bucketEndsAt.map((t, i) => (
              <th scope="col" key={i}>
                {jtime(new Date(t))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((t) => (
            <tr key={t.teamId}>
              <th scope="row">{t.name}</th>
              {(metric === "sales" ? t.sales : t.capital).map((v, i) => (
                <td key={i}>{fa(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
