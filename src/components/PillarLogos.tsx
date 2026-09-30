import Image from "next/image";
import { PILLARS, pillarLogo, type Pillar } from "@/lib/pillars";

// ارتفاع هر لوگو از نسبت ابعادش درمی‌آید تا مساحت ظاهری‌شان نزدیک هم باشد؛
// وگرنه لوگوهای مربعی کنار لوگوهای پهن (مثل الیت‌لند) خیلی کوچک دیده می‌شوند.
function logoHeight(p: Pillar, base: number, max: number) {
  return Math.min(max, Math.round(base / Math.sqrt(p.w / p.h)));
}

// کاشی‌ها عمداً همیشه سفیدند (bg-[#fff] و نه bg-white که در حالت تیره بازنویسی می‌شود)؛
// چند لوگو متن سیاه دارند و روی زمینهٔ تیره دیده نمی‌شوند.

/** شبکهٔ کامل لوگوها برای صفحهٔ فرود */
export function PillarGrid() {
  return (
    <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 stagger">
      {PILLARS.map((p) => (
        <li key={p.slug} className="rounded-2xl border border-brand-mist bg-[#fff] h-20 sm:h-24 px-3 flex items-center justify-center" title={p.name}>
          <Image src={pillarLogo(p)} alt={p.name} width={p.w} height={p.h} style={{ height: logoHeight(p, 64, 56) }} className="w-auto max-w-full object-contain" />
        </li>
      ))}
    </ul>
  );
}

/** نوار فشردهٔ لوگوها برای فوتر */
export function PillarStrip() {
  return (
    <ul className="mx-auto max-w-5xl flex flex-wrap items-center justify-center gap-x-5 gap-y-3 rounded-2xl bg-[#fff] px-4 py-3" aria-label="پیلارهای گروه پگاه">
      {PILLARS.map((p) => (
        <li key={p.slug} title={p.name}>
          <Image src={pillarLogo(p)} alt={p.name} width={p.w} height={p.h} style={{ height: logoHeight(p, 38, 32) }} className="w-auto grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition" />
        </li>
      ))}
    </ul>
  );
}
