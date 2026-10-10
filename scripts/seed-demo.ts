/**
 * دادهٔ نمایشی واقع‌نما برای اسکرین‌شات و دمو (نه برای تست یا production).
 *
 *   DATABASE_URL=file:/abs/path/demo.db npx prisma migrate deploy
 *   DATABASE_URL=file:/abs/path/demo.db npx tsx scripts/seed-demo.ts [stage]
 *
 * stage:
 *   market  (پیش‌فرض) — ۱۰ تیم، ایده، سرمایه‌گذاری، محصول، فروش و قلب؛ فاز MARKET
 *   auction — به‌علاوهٔ حراج‌های تمام‌شده و یک حراج زنده؛ فاز AUCTION
 *   closed  — تسویهٔ نهایی و نتایج؛ فاز CLOSED
 *
 * همهٔ نام‌ها، ایمیل‌ها و عددها ساختگی‌اند. فقط روی پایگاه‌داده‌ای اجرا می‌شود که نامش
 * «demo» دارد تا تصادفاً dev.db یا دادهٔ واقعی را آلوده نکند. رمز همهٔ کاربران: Demo#1404
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const url = process.env.DATABASE_URL ?? "";
if (!/demo[^/]*\.db$/i.test(url)) {
  console.error("[seed-demo] DATABASE_URL باید به فایلی با نام *demo*.db اشاره کند.");
  process.exit(1);
}

const DOMAIN = "demo.arena";
const PASSWORD = "Demo#1404";
const HOUR = 3600 * 1000;

// PRNG قطعی تا هر اجرا همان داده را بسازد
let s = 1404;
const rand = () => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return s / 2147483648;
};
const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const shuffled = <T,>(xs: T[]) => [...xs].sort(() => rand() - 0.5);

type Member = { nick: string; dept: string; role: "BUILDER" | "STORYTELLER" | "DEALMAKER"; power: string };
type TeamDef = {
  slug: string;
  name: string;
  members: [Member, Member, Member];
  idea: { title: string; oneLiner: string; problem: string; audience: string; buildPlan: string; cap: number; share: number };
  product: { name: string; tagline: string; description: string; price: number; special: string; specialDesc: string; start: number };
  scores: [number, number, number, number, number]; // analyst clarity/feasibility/novelty, jury quality/teaser
};

// رنگ هر تیم برای تصاویر نمایشی
const HUES = [195, 265, 350, 215, 18, 290, 150, 230, 38, 175];

const TEAMS: TeamDef[] = [
  {
    slug: "simorgh",
    name: "سیمرغ",
    members: [
      { nick: "آرش کاوه", dept: "بک‌اند", role: "BUILDER", power: "HYPE" },
      { nick: "نیلوفر رها", dept: "طراحی", role: "STORYTELLER", power: "SHIELD" },
      { nick: "کامران پویا", dept: "فروش", role: "DEALMAKER", power: "BARGAIN" },
    ],
    idea: {
      title: "تبلیغ‌سنج",
      oneLiner: "پیش‌بینی نرخ کلیک بنر پیش از انتشار با یک عکس",
      problem: "تبلیغ‌دهنده‌های کوچک تا بودجه را خرج نکنند نمی‌فهمند کدام بنر بهتر جواب می‌دهد و آزمون A/B برایشان گران است.",
      audience: "کسب‌وکارهای کوچک و آژانس‌های تبلیغاتی که ماهانه کمتر از ۵۰ میلیون تومان تبلیغ می‌خرند.",
      buildPlan: "مدل ساده روی داده‌های عمومی کلیک، صفحهٔ آپلود بنر و گزارش یک‌صفحه‌ای با پیشنهاد بهبود رنگ و متن.",
      cap: 320,
      share: 35,
    },
    product: {
      name: "تبلیغ‌سنج",
      tagline: "قبل از خرج کردن، بدان کدام بنر برنده است",
      description: "بنر را آپلود کن؛ در کمتر از ده ثانیه نرخ کلیک پیش‌بینی‌شده، نقشهٔ حرارتی توجه و سه پیشنهاد عملی برای بهتر شدنش را می‌گیری.",
      price: 25,
      special: "تبلیغ‌سنج — نسخهٔ آژانس",
      specialDesc: "گزارش‌های نامحدود برای ده برند و خروجی PDF با لوگوی آژانس.",
      start: 20,
    },
    scores: [88, 76, 81, 91, 84],
  },
  {
    slug: "kahkeshan",
    name: "کهکشان",
    members: [
      { nick: "سارا مهرگان", dept: "موبایل", role: "BUILDER", power: "ANGEL" },
      { nick: "بهراد نیک‌نام", dept: "مارکتینگ", role: "STORYTELLER", power: "INSIDER" },
      { nick: "مهسا روشن", dept: "محصول", role: "DEALMAKER", power: "SECOND_WIND" },
    ],
    idea: {
      title: "جیب‌پول",
      oneLiner: "کیف پول بچه‌ها با سقف خرج و جایزهٔ پس‌انداز",
      problem: "والدین راهی ساده برای یاد دادن مدیریت پول به نوجوان‌ها ندارند و پول توجیبی نقدی قابل پیگیری نیست.",
      audience: "خانواده‌های شهری با فرزند ۱۰ تا ۱۶ ساله.",
      buildPlan: "اپ موبایل با دو نقش والد و فرزند، سقف خرج روزانه و هدف پس‌انداز با نشان‌های تشویقی.",
      cap: 280,
      share: 40,
    },
    product: {
      name: "جیب‌پول",
      tagline: "پول توجیبی هوشمند برای نسل تازه",
      description: "والد سقف خرج و هدف پس‌انداز تعیین می‌کند؛ فرزند با هر قدم پس‌انداز نشان می‌گیرد و گزارش هفتگی به هر دو می‌رسد.",
      price: 18,
      special: "جیب‌پول خانواده",
      specialDesc: "تا چهار فرزند در یک حساب و چالش پس‌انداز خانوادگی.",
      start: 16,
    },
    scores: [82, 85, 70, 86, 90],
  },
  {
    slug: "parvaz",
    name: "پرواز",
    members: [
      { nick: "امیرحسین دانا", dept: "فرانت‌اند", role: "BUILDER", power: "BARGAIN" },
      { nick: "ترانه صدری", dept: "طراحی", role: "STORYTELLER", power: "HYPE" },
      { nick: "رضا فرزین", dept: "فروش", role: "DEALMAKER", power: "SHIELD" },
    ],
    idea: {
      title: "صف‌یار",
      oneLiner: "نوبت‌دهی آنلاین برای مطب‌ها و آرایشگاه‌ها با یادآوری پیامکی",
      problem: "کسب‌وکارهای خدماتی کوچک هنوز با دفترچه نوبت می‌دهند و ۲۰٪ مشتری‌ها سر نوبت نمی‌آیند.",
      audience: "مطب‌ها، آرایشگاه‌ها و کارگاه‌های کوچک خدماتی.",
      buildPlan: "صفحهٔ رزرو قابل اشتراک، پنل مدیریت روزانه و یادآوری خودکار یک ساعت قبل از نوبت.",
      cap: 250,
      share: 30,
    },
    product: {
      name: "صف‌یار",
      tagline: "نوبت‌ها سر وقت، صندلی‌ها پر",
      description: "لینک رزرو را در اینستاگرام بگذار؛ مشتری خودش نوبت می‌گیرد، یادآوری می‌گیرد و اگر نیاید نوبت به نفر بعدی می‌رسد.",
      price: 15,
      special: "صف‌یار حرفه‌ای",
      specialDesc: "چند شعبه، چند کارمند و گزارش درآمد ماهانه.",
      start: 14,
    },
    scores: [90, 88, 62, 80, 72],
  },
  {
    slug: "alborz",
    name: "البرز",
    members: [
      { nick: "پرهام شکیبا", dept: "دیتا", role: "BUILDER", power: "INSIDER" },
      { nick: "یاسمن وفا", dept: "محتوا", role: "STORYTELLER", power: "ANGEL" },
      { nick: "حمید سپهری", dept: "مالی", role: "DEALMAKER", power: "HYPE" },
    ],
    idea: {
      title: "داده‌نما",
      oneLiner: "داشبورد فروش فروشگاه اینترنتی در پنج دقیقه، بدون کدنویسی",
      problem: "فروشگاه‌های اینترنتی کوچک داده دارند ولی تحلیلگر ندارند؛ گزارش‌ها در اکسل‌های پراکنده گم می‌شوند.",
      audience: "فروشندگان ووکامرس و فروشگاه‌سازهای ایرانی.",
      buildPlan: "اتصال به API فروشگاه، شش نمودار کلیدی و هشدار خودکار افت فروش.",
      cap: 360,
      share: 45,
    },
    product: {
      name: "داده‌نما",
      tagline: "فروشگاهت را با عدد ببین",
      description: "با یک کلیک به فروشگاه وصل شو؛ پرفروش‌ترین کالاها، سبد خرید رهاشده و روند هفتگی را روی یک داشبورد ببین.",
      price: 30,
      special: "داده‌نما — پیش‌بینی فروش",
      specialDesc: "پیش‌بینی فروش ماه آینده و پیشنهاد موجودی انبار.",
      start: 24,
    },
    scores: [78, 72, 75, 84, 68],
  },
  {
    slug: "atash",
    name: "آتش",
    members: [
      { nick: "شایان قدیری", dept: "بک‌اند", role: "BUILDER", power: "SECOND_WIND" },
      { nick: "الهه نوروزی", dept: "مارکتینگ", role: "STORYTELLER", power: "BARGAIN" },
      { nick: "مجید آذری", dept: "فروش", role: "DEALMAKER", power: "ANGEL" },
    ],
    idea: {
      title: "پادکست‌یاب",
      oneLiner: "تبلیغ صوتی هدفمند در پادکست‌های فارسی",
      problem: "پادکسترهای فارسی مخاطب وفادار دارند ولی راهی برای فروش تبلیغ به برندها ندارند.",
      audience: "پادکسترهای مستقل و برندهایی که مخاطب جوان می‌خواهند.",
      buildPlan: "بازارچهٔ جایگاه تبلیغ صوتی، قیمت‌گذاری بر اساس شنونده و گزارش پخش.",
      cap: 220,
      share: 50,
    },
    product: {
      name: "پادکست‌یاب",
      tagline: "صدای برندت در گوش مخاطب درست",
      description: "برند بودجه و مخاطب را مشخص می‌کند، پادکست‌های مناسب پیشنهاد می‌شوند و پس از پخش گزارش شنیده‌شدن می‌رسد.",
      price: 20,
      special: "پادکست‌یاب — بستهٔ فصل",
      specialDesc: "تبلیغ در ده قسمت پیاپی با تخفیف فصلی.",
      start: 18,
    },
    scores: [74, 70, 86, 77, 88],
  },
  {
    slug: "setareh",
    name: "ستاره",
    members: [
      { nick: "فرناز کیانی", dept: "فرانت‌اند", role: "BUILDER", power: "SHIELD" },
      { nick: "سینا مرادی", dept: "طراحی", role: "STORYTELLER", power: "SECOND_WIND" },
      { nick: "نگین اصلانی", dept: "منابع انسانی", role: "DEALMAKER", power: "INSIDER" },
    ],
    idea: {
      title: "هم‌قدم",
      oneLiner: "آشنایی نیروی تازه‌وارد با شرکت در هفتهٔ اول، قدم‌به‌قدم",
      problem: "هفتهٔ اول نیروی جدید با سؤال‌های تکراری و فرم‌های پراکنده هدر می‌رود.",
      audience: "واحدهای منابع انسانی شرکت‌های ۵۰ تا ۵۰۰ نفره.",
      buildPlan: "مسیر آشنایی روزبه‌روز، چک‌لیست تجهیزات و دستیار پاسخ به سؤال‌های پرتکرار.",
      cap: 200,
      share: 25,
    },
    product: {
      name: "هم‌قدم",
      tagline: "روز اول کاری، بدون سردرگمی",
      description: "هر نیروی تازه یک مسیر شخصی می‌گیرد: معرفی تیم، دسترسی‌ها، جلسه‌های آشنایی و یک دستیار که همیشه جواب می‌دهد.",
      price: 12,
      special: "هم‌قدم سازمانی",
      specialDesc: "اتصال به سامانهٔ حضور و غیاب و گزارش رضایت نیروها.",
      start: 12,
    },
    scores: [85, 90, 58, 74, 64],
  },
  {
    slug: "darya",
    name: "دریا",
    members: [
      { nick: "کیوان رستمی", dept: "زیرساخت", role: "BUILDER", power: "BARGAIN" },
      { nick: "مریم تابان", dept: "محتوا", role: "STORYTELLER", power: "ANGEL" },
      { nick: "بابک یزدانی", dept: "فروش", role: "DEALMAKER", power: "HYPE" },
    ],
    idea: {
      title: "سبزینه",
      oneLiner: "یادآور آبیاری و مراقبت گیاه آپارتمانی با عکس",
      problem: "بیشتر گیاهان آپارتمانی به‌خاطر آبیاری نادرست در سه ماه اول از بین می‌روند.",
      audience: "ساکنان آپارتمان و گلفروشی‌های آنلاین.",
      buildPlan: "تشخیص گونه از روی عکس، تقویم مراقبت و فروشگاه کوچک کود و گلدان.",
      cap: 180,
      share: 35,
    },
    product: {
      name: "سبزینه",
      tagline: "گیاهت را بشناس، زنده نگهش دار",
      description: "از گیاه عکس بگیر؛ نامش، نیاز نور و آب و تقویم مراقبت را می‌گیری و وقت آبیاری یادآوری می‌شود.",
      price: 10,
      special: "سبزینه — باغچهٔ کامل",
      specialDesc: "تا ۳۰ گیاه و مشاورهٔ ماهانه با گیاه‌پزشک.",
      start: 10,
    },
    scores: [80, 78, 66, 70, 76],
  },
  {
    slug: "tondar",
    name: "تندر",
    members: [
      { nick: "علیرضا مقدم", dept: "بک‌اند", role: "BUILDER", power: "INSIDER" },
      { nick: "هانیه شریفی", dept: "طراحی", role: "STORYTELLER", power: "SHIELD" },
      { nick: "پویان خسروی", dept: "مالی", role: "DEALMAKER", power: "SECOND_WIND" },
    ],
    idea: {
      title: "فاکتورچی",
      oneLiner: "صدور و پیگیری فاکتور برای فریلنسرها در یک پیام",
      problem: "فریلنسرها وقت زیادی صرف ساخت فاکتور و پیگیری پرداخت‌های معوق می‌کنند.",
      audience: "طراحان، برنامه‌نویسان و مترجمان آزادکار.",
      buildPlan: "ساخت فاکتور از قالب، لینک پرداخت و یادآوری خودکار سررسید.",
      cap: 240,
      share: 30,
    },
    product: {
      name: "فاکتورچی",
      tagline: "کار کن، فاکتورچی بقیه‌اش را می‌گیرد",
      description: "فاکتور رسمی در سی ثانیه، لینک پرداخت آنلاین و یادآوری مؤدبانه برای مشتری‌هایی که دیر می‌کنند.",
      price: 22,
      special: "فاکتورچی — تیمی",
      specialDesc: "چند کاربر، گزارش مالیاتی فصلی و قالب اختصاصی.",
      start: 20,
    },
    scores: [86, 82, 60, 79, 70],
  },
  {
    slug: "ghoghnoos",
    name: "ققنوس",
    members: [
      { nick: "دلارام حیدری", dept: "موبایل", role: "BUILDER", power: "HYPE" },
      { nick: "مهدی باقری", dept: "مارکتینگ", role: "STORYTELLER", power: "BARGAIN" },
      { nick: "زهره فتحی", dept: "محصول", role: "DEALMAKER", power: "ANGEL" },
    ],
    idea: {
      title: "کتاب‌باز",
      oneLiner: "باشگاه کتاب‌خوانی آنلاین با خلاصهٔ صوتی ده‌دقیقه‌ای",
      problem: "خیلی‌ها می‌خواهند بیشتر کتاب بخوانند ولی انگیزه و هم‌مسیر ندارند.",
      audience: "کارمندان ۲۵ تا ۴۰ ساله و کتاب‌فروشی‌های آنلاین.",
      buildPlan: "گروه‌های ماهانه، چالش خواندن و خلاصهٔ صوتی تولیدشده با هوش مصنوعی.",
      cap: 260,
      share: 40,
    },
    product: {
      name: "کتاب‌باز",
      tagline: "هر ماه یک کتاب، با هم‌مسیرهای تازه",
      description: "به یک باشگاه بپیوند، هر هفته فصلی بخوان، خلاصهٔ صوتی بشنو و در گفت‌وگوی گروهی نظرت را بگو.",
      price: 14,
      special: "کتاب‌باز طلایی",
      specialDesc: "دسترسی یک‌ساله و دیدار حضوری با نویسنده.",
      start: 14,
    },
    scores: [83, 80, 72, 82, 86],
  },
  {
    slug: "kavir",
    name: "کویر",
    members: [
      { nick: "نوید اکبری", dept: "دیتا", role: "BUILDER", power: "SHIELD" },
      { nick: "شیرین جلالی", dept: "محتوا", role: "STORYTELLER", power: "INSIDER" },
      { nick: "سامان عباسی", dept: "فروش", role: "DEALMAKER", power: "BARGAIN" },
    ],
    idea: {
      title: "مسیرسبز",
      oneLiner: "هم‌سفری روزانه تا محل کار برای همکاران یک مجتمع",
      problem: "رفت‌وآمد روزانه گران و خسته‌کننده است و همکاران هم‌مسیر همدیگر را پیدا نمی‌کنند.",
      audience: "کارمندان شهرک‌ها و مجتمع‌های اداری.",
      buildPlan: "ثبت مسیر، تطبیق خودکار هم‌مسیرها و تقسیم هزینهٔ سفر.",
      cap: 200,
      share: 20,
    },
    product: {
      name: "مسیرسبز",
      tagline: "با همکارت برو، نصف بپرداز",
      description: "مسیرت را یک‌بار ثبت کن؛ هر صبح هم‌مسیرهای مجتمع پیشنهاد می‌شوند و هزینه خودکار تقسیم می‌شود.",
      price: 8,
      special: "مسیرسبز سازمانی",
      specialDesc: "پنل منابع انسانی و گزارش کاهش ردپای کربن.",
      start: 8,
    },
    scores: [76, 74, 68, 66, 60],
  },
];

/**
 * تصویر نمایشی محصول (بدون متن، بدون وابستگی شبکه): یک ماکت انتزاعی رابط کاربری روی
 * گرادیان رنگ تیم. مثل آپلود واقعی در UPLOAD_DIR با نام sha256 و بندانگشتی ۴۸۰ ذخیره می‌شود.
 */
async function art(hue: number, variant: number): Promise<string> {
  const c = (l: number, sat = 70) => `hsl(${hue},${sat}%,${l}%)`;
  const c2 = (l: number) => `hsl(${(hue + 40) % 360},75%,${l}%)`;
  const W = 1600, H = 1000;
  let body = "";
  if (variant === 0) {
    // داشبورد: کارت‌های آمار + نمودار میله‌ای
    body += [0, 1, 2].map((i) => `<rect x="${360 + i * 300}" y="300" width="270" height="120" rx="18" fill="${i === 0 ? c(55) : "#f1f5f9"}"/><rect x="${384 + i * 300}" y="330" width="${90 + i * 20}" height="14" rx="7" fill="${i === 0 ? "#fff" : "#cbd5e1"}"/><rect x="${384 + i * 300}" y="362" width="140" height="28" rx="8" fill="${i === 0 ? "#fff" : c(35)}"/>`).join("");
    const bars = [180, 240, 150, 300, 260, 340, 220, 380, 310];
    body += bars.map((h, i) => `<rect x="${380 + i * 92}" y="${820 - h}" width="56" height="${h}" rx="10" fill="${i === 7 ? c2(55) : c(62 + (i % 3) * 6)}"/>`).join("");
  } else if (variant === 1) {
    // فهرست: ردیف‌ها با آواتار و برچسب
    body += [0, 1, 2, 3, 4].map((i) => `<rect x="360" y="${300 + i * 106}" width="880" height="86" rx="18" fill="${i === 1 ? c(94) : "#f8fafc"}"/><circle cx="1190" cy="${343 + i * 106}" r="26" fill="${c(50 + i * 7)}"/><rect x="${860 - i * 30}" y="${325 + i * 106}" width="${280 + i * 30}" height="16" rx="8" fill="#94a3b8"/><rect x="${960}" y="${352 + i * 106}" width="180" height="12" rx="6" fill="#cbd5e1"/><rect x="390" y="${326 + i * 106}" width="110" height="34" rx="17" fill="${i % 2 ? c2(58) : c(55)}"/>`).join("");
  } else {
    // موبایل: دو گوشی کنار هم
    for (const [x, tilt] of [[520, -6], [880, 5]] as const) {
      body += `<g transform="rotate(${tilt} ${x + 110} 600)"><rect x="${x}" y="300" width="240" height="480" rx="36" fill="#0f172a"/><rect x="${x + 12}" y="316" width="216" height="448" rx="26" fill="#fff"/><rect x="${x + 30}" y="350" width="180" height="120" rx="16" fill="${c(60)}"/><circle cx="${x + 120}" cy="410" r="30" fill="#fff" opacity=".8"/>${[0, 1, 2, 3].map((i) => `<rect x="${x + 30}" y="${490 + i * 56}" width="180" height="40" rx="12" fill="${i === 0 ? c2(88) : "#f1f5f9"}"/><rect x="${x + 44}" y="${504 + i * 56}" width="${80 + i * 16}" height="12" rx="6" fill="#94a3b8"/>`).join("")}</g>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c(42, 65)}"/><stop offset="1" stop-color="${c2(30)}"/></linearGradient>
<filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="24" stdDeviation="30" flood-opacity=".28"/></filter></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<circle cx="1450" cy="120" r="260" fill="#fff" opacity=".08"/><circle cx="120" cy="930" r="320" fill="#fff" opacity=".06"/>
${variant === 2 ? body : `<g filter="url(#sh)"><rect x="310" y="170" width="980" height="720" rx="28" fill="#fff"/></g>
<rect x="310" y="170" width="980" height="80" rx="28" fill="#f1f5f9"/><rect x="310" y="222" width="980" height="28" fill="#f1f5f9"/>
<circle cx="1240" cy="210" r="11" fill="#f87171"/><circle cx="1206" cy="210" r="11" fill="#fbbf24"/><circle cx="1172" cy="210" r="11" fill="#34d399"/>
<rect x="360" y="198" width="360" height="24" rx="12" fill="#e2e8f0"/>${body}`}
</svg>`;
  const full = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
  const thumb = await sharp(full).resize(480).webp({ quality: 80 }).toBuffer();
  const hash = createHash("sha256").update(full).digest("hex");
  const dir = process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${hash}.webp`), full);
  await writeFile(path.join(dir, `${hash}-480.webp`), thumb);
  return `/uploads/${hash}.webp`;
}

async function main() {
  const stage = (process.argv[2] ?? "market") as "market" | "auction" | "closed";
  const { prisma } = await import("../src/lib/db");
  const { investCore } = await import("../src/lib/invest");
  const { purchaseProduct } = await import("../src/lib/market");

  const already = await prisma.team.count();
  if (already === 0) await seedBase(prisma, investCore, purchaseProduct);
  if (stage === "auction" || stage === "closed") await seedAuctions(prisma);
  if (stage === "closed") {
    const { settleGame } = await import("../src/lib/settlement");
    await setPhase(prisma, "CLOSED", null);
    const r = await settleGame();
    console.log("[seed-demo] settled:", r.dividendsPaid, "dividends");
    await seedSurvey(prisma);
  }
  console.log(`[seed-demo] done (stage=${stage}). login: <nick>@${DOMAIN} / ${PASSWORD}`);
  await prisma.$disconnect();
}

type Prisma = typeof import("../src/lib/db").prisma;

async function setPhase(prisma: Prisma, phase: string, endsAt: Date | null) {
  await prisma.setting.upsert({ where: { key: "phase" }, update: { value: phase }, create: { key: "phase", value: phase } });
  const v = endsAt ? endsAt.toISOString() : "";
  await prisma.setting.upsert({ where: { key: "phase_ends_at" }, update: { value: v }, create: { key: "phase_ends_at", value: v } });
}

async function seedBase(
  prisma: Prisma,
  investCore: typeof import("../src/lib/invest").investCore,
  purchaseProduct: typeof import("../src/lib/market").purchaseProduct
) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  // خط زمانی فشرده: ثبت‌نام ۴۰ ساعت پیش، ایده‌ها ۲۰ ساعت پیش، سرمایه‌گذاری ۱۶ تا ۱۲ ساعت پیش، محصول ۸ ساعت پیش، بازار ۶ ساعت اخیر
  const t0 = Date.now() - 40 * HOUR;

  await prisma.user.create({
    data: {
      email: `admin@${DOMAIN}`,
      passwordHash: hash,
      nickname: "برگزارکننده",
      role: "DEALMAKER",
      power: "SHIELD",
      isAdmin: true,
      avatarSeed: "demo-admin",
    },
  });

  const teamIds: string[] = [];
  const userIds: string[][] = [];
  for (const [ti, t] of TEAMS.entries()) {
    const team = await prisma.team.create({
      data: { name: t.name, slug: t.slug, logoSeed: `demo-${t.slug}`, createdAt: new Date(t0 + ti * 20 * 60000) },
    });
    teamIds.push(team.id);
    const ids: string[] = [];
    for (const [mi, m] of t.members.entries()) {
      const u = await prisma.user.create({
        data: {
          email: `${t.slug}${mi + 1}@${DOMAIN}`,
          passwordHash: hash,
          nickname: m.nick,
          role: m.role,
          power: m.power,
          department: m.dept,
          avatarSeed: `demo-${t.slug}-${mi}`,
          teamId: team.id,
          coffee: ri(2, 9),
          bugs: ri(10, 80),
          sleep: ri(4, 8),
          confidence: ri(60, 100),
          createdAt: new Date(t0 + ti * 20 * 60000 + mi * 5 * 60000),
        },
      });
      ids.push(u.id);
    }
    userIds.push(ids);
    await prisma.team.update({ where: { id: team.id }, data: { leaderId: ids[0], leaderElectedAt: new Date(t0 + 3 * HOUR) } });

    const [clarity, feas, novelty] = t.scores;
    await prisma.idea.create({
      data: {
        teamId: team.id,
        title: t.idea.title,
        oneLiner: t.idea.oneLiner,
        problem: t.idea.problem,
        audience: t.idea.audience,
        buildPlan: t.idea.buildPlan,
        coverUrl: await art(HUES[ti], ti % 3),
        fundingCap: t.idea.cap,
        revenueShare: t.idea.share,
        analystClarity: clarity,
        analystFeasibility: feas,
        analystNovelty: novelty,
        analystSummary: `مسئله روشن و مخاطب مشخص است. ${feas >= 80 ? "ساخت نسخهٔ اول در ۴۸ ساعت کاملاً شدنی به نظر می‌رسد." : "دامنهٔ ساخت برای ۴۸ ساعت کمی بلندپروازانه است؛ روی یک قابلیت اصلی تمرکز کنید."} ${novelty >= 75 ? "ایده در بازار فارسی کم‌رقیب است." : "رقبای مشابه وجود دارند؛ تمایزتان را پررنگ‌تر کنید."}`,
        submittedAt: new Date(t0 + 20 * HOUR + ti * 17 * 60000),
      },
    });
  }

  // ---- دور سرمایه‌گذاری ----
  await setPhase(prisma, "SEED_ROUND", new Date(Date.now() + 6 * HOUR));
  const ideas = await prisma.idea.findMany({ select: { id: true, teamId: true } });
  // جذابیت هر ایده (برای توزیع واقع‌نمای سرمایه): امتیاز تحلیلگر
  const appeal = new Map(TEAMS.map((t, i) => [teamIds[i], t.scores[0] + t.scores[1] + t.scores[2]]));
  for (const [ti, ids] of userIds.entries()) {
    for (const uid of ids) {
      const targets = shuffled(ideas.filter((i) => i.teamId !== teamIds[ti]))
        .sort((a, b) => appeal.get(b.teamId)! - appeal.get(a.teamId)! + (rand() - 0.5) * 140)
        .slice(0, ri(3, 4));
      let left = ri(88, 100);
      for (const idea of targets) {
        const amt = Math.min(left, ri(18, 40));
        if (amt < 5) break;
        const r = await investCore(prisma, uid, idea.id, amt);
        if (r.ok) left -= amt;
      }
    }
  }
  // زمان ثبت سرمایه‌گذاری‌ها را در طول دور پخش کن تا فید و نمودار واقعی دیده شود
  const invs = await prisma.investment.findMany({ select: { id: true } });
  for (const [i, inv] of invs.entries()) {
    await prisma.investment.update({ where: { id: inv.id }, data: { createdAt: new Date(t0 + 24 * HOUR + i * 3 * 60000) } });
  }

  // پرسش و پاسخ ارزیابی با تحلیلگر (Due diligence) روی ایدهٔ اول
  const firstIdea = ideas.find((i) => i.teamId === teamIds[0])!;
  const qa: [string, string][] = [
    ["دقت پیش‌بینی نرخ کلیک چقدر است؟", "در نسخهٔ اول روی داده‌های آزمایشی خطای میانگین حدود ۱۸٪ گزارش شده؛ برای مقایسهٔ دو بنر کافی است ولی عدد مطلق را باید با احتیاط خواند."],
    ["مشتری اول از کجا می‌آید؟", "تیم قصد دارد از آژانس‌های کوچک شروع کند که هر هفته چند بنر می‌سازند؛ یک نسخهٔ رایگان محدود هم برای جذب اولیه در نظر گرفته شده."],
  ];
  for (const [i, [q, a]] of qa.entries()) {
    await prisma.dueDiligenceMessage.create({
      data: { ideaId: firstIdea.id, userId: userIds[3][2], question: q, answer: a, createdAt: new Date(t0 + 25 * HOUR + i * 4 * 60000) },
    });
  }

  // سپر: دارندگان سپر بزرگ‌ترین سرمایه‌گذاری‌شان را بیمه می‌کنند
  const shielders = await prisma.user.findMany({ where: { power: "SHIELD", isAdmin: false }, select: { id: true } });
  for (const u of shielders) {
    const top = await prisma.investment.findFirst({ where: { userId: u.id }, orderBy: { amount: "desc" }, include: { idea: true } });
    if (top) await prisma.user.update({ where: { id: u.id }, data: { shieldTeamId: top.idea.teamId, powerUsed: true } });
  }

  // ---- محصول‌ها ----
  for (const [ti, t] of TEAMS.entries()) {
    await prisma.product.create({
      data: {
        teamId: teamIds[ti],
        name: t.product.name,
        tagline: t.product.tagline,
        description: t.product.description,
        demoUrl: "",
        teaserUrl: "",
        images: JSON.stringify([await art(HUES[ti], ti % 3), await art(HUES[ti], (ti + 1) % 3), await art(HUES[ti], (ti + 2) % 3)]),
        price: t.product.price,
        specialName: t.product.special,
        specialDesc: t.product.specialDesc,
        specialStart: t.product.start,
        submittedAt: new Date(t0 + 31 * HOUR + ti * 11 * 60000),
        juryQuality: t.scores[3],
        juryTeaser: t.scores[4],
        aiQuality: Math.round((t.scores[3] + t.scores[0]) / 2),
        aiNotes: "رابط کاربری تمیز و مسیر اصلی کامل است؛ صفحهٔ معرفی می‌تواند مزیت اصلی را زودتر نشان دهد.",
      },
    });
  }

  // ---- روز بازار ----
  await setPhase(prisma, "MARKET", new Date(Date.now() + 3 * HOUR + 25 * 60000));
  const products = await prisma.product.findMany({ select: { id: true, teamId: true } });
  const quality = new Map(TEAMS.map((t, i) => [teamIds[i], t.scores[3] + t.scores[4]]));
  for (const [ti, ids] of userIds.entries()) {
    for (const uid of ids) {
      const picks = shuffled(products.filter((p) => p.teamId !== teamIds[ti]))
        .sort((a, b) => quality.get(b.teamId)! - quality.get(a.teamId)! + (rand() - 0.5) * 90)
        .slice(0, ri(2, 4));
      for (const p of picks) {
        const times = rand() < 0.2 ? 2 : 1;
        for (let k = 0; k < times; k++) await purchaseProduct(uid, p.id);
        if (rand() < 0.75) await prisma.heart.create({ data: { productId: p.id, userId: uid } }).catch(() => {});
      }
    }
  }
  const purchases = await prisma.purchase.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
  const marketStart = Date.now() - 6 * HOUR;
  for (const [i, p] of purchases.entries()) {
    const at = new Date(marketStart + Math.floor((i / purchases.length) * 5.8 * HOUR) - 60000);
    await prisma.purchase.update({ where: { id: p.id }, data: { createdAt: at } });
    await prisma.ledgerEntry.updateMany({ where: { refId: p.id, reason: "PURCHASE" }, data: { createdAt: at } });
  }

  await prisma.announcement.create({
    data: { text: "حراج زندهٔ نسخه‌های ویژه ساعت ۱۸ در سالن اصلی شروع می‌شود؛ کیف خریدت را خالی نکن!", level: "info" },
  });
  await prisma.setting.upsert({ where: { key: "market_starts_at" }, update: { value: new Date(marketStart).toISOString() }, create: { key: "market_starts_at", value: new Date(marketStart).toISOString() } });
}

async function seedAuctions(prisma: Prisma) {
  if ((await prisma.auction.count()) > 0) return;
  const { ensureAuctions, placeBid } = await import("../src/lib/auction");
  await setPhase(prisma, "AUCTION", new Date(Date.now() + 55 * 60000));
  await ensureAuctions();
  const auctions = await prisma.auction.findMany({ orderBy: { order: "asc" }, include: { product: { include: { team: true } } } });
  // حراج زنده (چهارمی) یک نسخهٔ ارزان باشد تا بیشتر بازیکنان هنوز بتوانند پیشنهاد بدهند
  const cheap = auctions.findIndex((a, i) => i >= 3 && a.product.specialStart <= 14 && a.product.team.slug !== "kahkeshan");
  if (cheap > 3) {
    const [x, y] = [auctions[3], auctions[cheap]];
    await prisma.auction.update({ where: { id: x.id }, data: { order: y.order } });
    await prisma.auction.update({ where: { id: y.id }, data: { order: x.order } });
    [x.order, y.order] = [y.order, x.order];
    auctions.sort((m, n) => m.order - n.order);
  }
  const players = await prisma.user.findMany({ where: { isAdmin: false }, select: { id: true, teamId: true } });

  // سه حراج اول تمام شده، چهارمی زنده است
  for (const [i, a] of auctions.slice(0, 4).entries()) {
    const live = i === 3;
    const start = live ? Date.now() - 2 * 60000 : Date.now() - (40 - i * 10) * 60000;
    await prisma.auction.update({
      where: { id: a.id },
      data: { status: "LIVE", startsAt: new Date(start), endsAt: new Date(live ? Date.now() + 10 * 60000 : Date.now() + 60 * 60000) },
    });
    const bidders = shuffled(players.filter((p) => p.teamId !== a.product.teamId)).slice(0, live ? 5 : 4);
    let amount = a.startPrice;
    for (let k = 0; k < (live ? 7 : 5); k++) {
      const b = bidders[k % bidders.length];
      try {
        await placeBid(a.id, b.id, amount);
      } catch {
        // موجودی کافی نیست؛ پیشنهاد بعدی
      }
      amount += 2 * ri(1, 3);
    }
    const bids = await prisma.bid.findMany({ where: { auctionId: a.id }, orderBy: { createdAt: "asc" } });
    for (const [j, b] of bids.entries()) {
      await prisma.bid.update({ where: { id: b.id }, data: { createdAt: new Date(start + (j + 1) * 25000) } });
    }
    if (!live) {
      await prisma.auction.update({ where: { id: a.id }, data: { endsAt: new Date(start + 5 * 60000) } });
      const { settleIfEnded } = await import("../src/lib/auction");
      await settleIfEnded(a.id);
    } else {
      await prisma.auction.update({ where: { id: a.id }, data: { endsAt: new Date(Date.now() + 4 * 60000 + 37000), extensions: 1 } });
    }
  }
}

async function seedSurvey(prisma: Prisma) {
  const users = await prisma.user.findMany({ where: { isAdmin: false }, select: { id: true }, take: 22 });
  const comments = ["بهترین روز برنامه‌نویس تا حالا!", "حراج زنده خیلی هیجان داشت.", "کاش زمان ساخت کمی بیشتر بود.", "", "کار تیمی با واحدهای دیگر عالی بود.", ""];
  for (const [i, u] of users.entries()) {
    await prisma.surveyResponse
      .create({ data: { userId: u.id, rating: ri(4, 5), fun: ri(3, 5), learned: ri(3, 5), comment: comments[i % comments.length] } })
      .catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
