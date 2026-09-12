# قراردادهای مشترک پروژه (برای همهٔ ایجنت‌ها)

## زبان و ظاهر
- همه‌چیز فارسی و راست‌چین. هیچ متن انگلیسی در UI به‌جز نام برند «تپسل» در لوگو.
- اعداد را با `fa()` از `@/lib/persian` فارسی کنید؛ تاریخ با `jdate/jdatetime`؛ مدت با `duration`؛ سکه با `coins`.
- پالت تپسل در `globals.css`: قرمز `brand-red` (اکشن اصلی)، آبی `brand-cyan` (اکشن ثانویه/تأکید)، سرمه‌ای `brand-navy` (متن)، `brand-ice/mist/sky` (پس‌زمینه‌های ملایم).
- کلاس‌های آماده: `btn-primary`, `btn-cyan`, `btn-ghost`, `btn-navy`, `card`, `chip-*`, `input`, `label`, `anim-rise`, `anim-pop`, `stagger`, `bg-hero`, `bg-dots`.
- کامپوننت‌های مشترک در `@/components/ui`: `PageHeader`, `Container`, `Coin`, `Empty`, `Locked`, `Stat`, `Alert`. آواتار: `@/components/Avatar`.
- تصاویر: از `https://picsum.photos/seed/<seed>/800/500` برای جلد و پس‌زمینه‌های نمونه استفاده کنید (بدون کلید). `next.config.ts` این دامنه را مجاز کرده است. برای عناصر تزئینی، SVG درون‌خطی یا CSS.
- انیمیشن: ورود عناصر با `anim-rise`/`stagger`؛ بازخورد اکشن با `anim-pop`. بدون کتابخانهٔ انیمیشن خارجی.

## معماری
- Next.js 16 App Router، TypeScript strict، Tailwind 4، Prisma + SQLite.
- صفحات سرور هستند (`async` server components) و داده را مستقیم از `prisma` می‌خوانند. تعامل با **Server Actions** در فایل `actions.ts` کنار هر صفحه (`"use server"`). برای زنده بودن (حراج، نوار فروش) از **polling** با `fetch` به route handler هر ۲ تا ۳ ثانیه (بدون WebSocket).
- احراز هویت: `requireUser()` / `getCurrentUser()` / `requireAdmin()` از `@/lib/auth`.
- فاز بازی: `getPhase()` از `@/lib/phase`. هر صفحه اگر فازش نرسیده، `<Locked>` نشان می‌دهد؛ اگر گذشته، حالت فقط‌خواندنی.
- ثابت‌ها: `@/lib/constants` (نقش‌ها، قدرت‌ها، DEFAULTS، وزن امتیاز). مقادیر قابل تغییر از `getSettingInt(key, DEFAULTS.x)` خوانده می‌شوند با کلیدهای: `seed_wallet`, `buy_wallet`, `max_per_target`, `penalty_per_coin`, `bid_increment`, `auction_duration_sec`.
- هر تغییر کیف پول یک `LedgerEntry` ثبت می‌کند و در یک `prisma.$transaction` انجام می‌شود.
- اعتبارسنجی ورودی با `zod`. خطاها به‌صورت `{ error: "متن فارسی" }` از اکشن برگردند؛ صفحه با `<Alert kind="error">` نشان دهد.
- هوش مصنوعی: `askText/askJson` از `@/lib/ai`؛ در نبود کلید `null` برمی‌گردد و UI باید بدون آن کار کند.
- هیچ فایل خارج از حوزهٔ خودتان را تغییر ندهید مگر `CONTRACTS.md` خلاف آن بگوید. `schema.prisma` را تغییر ندهید؛ اگر فیلدی لازم دارید در گزارش نهایی بنویسید.

## مسیرها (App Router)
- `/` فرود · `/register` · `/login` · `/profile` · `/team` · `/idea` · `/invest` (+ `/invest/[ideaId]`) · `/build` · `/market` (+ `/market/[slug]`) · `/auction` · `/adslots` · `/wallet` · `/leaderboard` · `/results` · `/admin/*`
- API polling: `/api/market/ticker`, `/api/auction/[id]/state`, `/api/phase`

## کیفیت
- `npx tsc --noEmit` و `npm run lint` باید پاک باشد. موتور اقتصاد با `npx vitest run` تست می‌شود.
