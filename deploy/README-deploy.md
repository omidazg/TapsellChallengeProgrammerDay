# راهنمای استقرار (Deploy) میدان بنیان‌گذاران تپسل

این راهنما نحوهٔ نصب و اجرای پروژه روی سرور Ubuntu (`89.42.199.174`) با Docker Compose و Caddy را توضیح می‌دهد.

## ۱. نصب کلید عمومی روی سرور (یک بار، از ترمینال خودتان)

اگر کلید SSH را هنوز ندارید، بسازید:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/founders_arena -C "arena-deploy"
```

سپس کلید عمومی را با استفاده از رمز روت (فقط همین یک بار) روی سرور نصب کنید:

```bash
ssh-copy-id -i ~/.ssh/founders_arena.pub root@89.42.199.174
```

اگر `ssh-copy-id` در دسترس نبود (مثلاً در Git Bash ویندوز)، همین کار را دستی انجام دهید:

```bash
cat ~/.ssh/founders_arena.pub | ssh root@89.42.199.174 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
```

از این به بعد می‌توانید بدون رمز عبور وصل شوید:

```bash
ssh -i ~/.ssh/founders_arena root@89.42.199.174
```

## ۲. آماده‌سازی اولیهٔ سرور (setup)

یک بار روی سرور اجرا می‌شود (نصب Docker، فایروال، fail2ban، به‌روزرسانی خودکار و ساخت پوشه‌های `/srv/arena`):

```bash
ssh -i ~/.ssh/founders_arena root@89.42.199.174
# روی سرور:
mkdir -p /srv/arena/app && cd /srv/arena/app
```

فایل `deploy/server-setup.sh` را (بعد از استقرار اول با `deploy.sh` یا با `scp`) روی سرور اجرا کنید:

```bash
bash /srv/arena/app/deploy/server-setup.sh
```

این اسکریپت idempotent است؛ اجرای دوباره‌اش مشکلی ایجاد نمی‌کند.

برای سخت‌گیری بیشتر امنیتی (غیرفعال کردن ورود با رمز عبور SSH — فقط بعد از اینکه مطمئن شدید ورود با کلید کار می‌کند):

```bash
bash /srv/arena/app/deploy/server-setup.sh --harden
```

## ۳. استقرار برنامه (deploy)

ایمیج‌ها روی سرور ساخته نمی‌شوند. GitHub Actions (`.github/workflows/build-images.yml`) **فقط پس از سبز شدن CI** روی `main`، برای همان کامیتی که CI تست کرده دو ایمیج `ghcr.io/omidazg/founders-arena-web` و `-migrate` را با دو تگ می‌سازد: SHA کامل کامیت (ثابت) و `latest`. SHA داخل ایمیج هم به‌صورت `GIT_SHA` هست و `/api/health` آن را در فیلد `version` نشان می‌دهد.

از روی ماشین توسعه (Windows/Git Bash، یا هر شل POSIX)، از ریشهٔ پروژه:

```bash
SERVER=root@188.121.125.246 KEY=~/.ssh/tapsell_qeysar ./deploy/deploy.sh
# یک بیلد مشخص:
IMAGE_TAG=<sha کامل کامیت> SERVER=root@188.121.125.246 KEY=~/.ssh/tapsell_qeysar ./deploy/deploy.sh
```

این اسکریپت:
1. تگ را انتخاب می‌کند: `IMAGE_TAG` اگر داده شده باشد؛ وگرنه SHA کامل `git rev-parse HEAD` محلی، اگر ایمیجش در ghcr باشد (روی سرور با `docker manifest inspect` چک می‌شود). اگر نبود (کامیت push نشده یا CI/بیلد هنوز تمام نشده) با هشدار بزرگ و ۱۰ ثانیه مکث به `latest` برمی‌گردد و آن را به SHA داخل برچسب ایمیج پین می‌کند. برای جلوگیری، Ctrl-C بزنید و بعد از تمام شدن بیلد دوباره اجرا کنید.
2. کد پروژه را (بدون `node_modules`، `.next`، `data`، `.git`) در `/srv/arena/app` قرار می‌دهد (فایل compose و Caddyfile و `scripts/backup.mjs` از همین‌جا خوانده می‌شوند).
3. اگر `.env` روی سرور نبود، از روی `.env.example` می‌سازد. **`.env` سرور هرگز برای تگ ایمیج دست نمی‌خورد**: `IMAGE_TAG` فقط در شل راه‌دور پیش از `docker compose` export می‌شود.
4. ایمیج‌ها را pull می‌کند (تا ۸ بار تلاش)، `web` و `backup` را متوقف می‌کند تا `migrate` تنها روی دیتابیس اجرا شود، و `docker compose up -d` می‌زند.
5. تا ۲ دقیقه منتظر می‌ماند `/api/health` از داخل کانتینر `web` سالم جواب دهد. **اگر migrate یا این چک شکست بخورد، خودکار تگ قبلی را (بدون اجرای دوبارهٔ migrate) بالا می‌آورد و با کد غیرصفر خارج می‌شود.**
6. تگ را در `/srv/arena/.deployed-tag` و تگ قبلی را در `/srv/arena/.previous-tag` ثبت می‌کند، تگ‌های محلی `latest` سرور را هم به همین بیلد می‌برد (تا یک `docker compose up` دستی بدون `IMAGE_TAG` همان کد را اجرا کند)، Caddy را دوباره می‌سازد و `/api/health` را از پشت Caddy (`SITE_URL` سرور یا `HEALTH_URL`) چک می‌کند.

### برگشت به نسخهٔ قبل (rollback)

```bash
SERVER=root@188.121.125.246 KEY=~/.ssh/tapsell_qeysar ./deploy/rollback.sh          # تگ /srv/arena/.previous-tag
SERVER=root@188.121.125.246 KEY=~/.ssh/tapsell_qeysar ./deploy/rollback.sh <sha>    # یک بیلد قدیمی‌تر مشخص
```

- فقط `web`، `backup` و `caddy` را روی تگ قبلی بالا می‌آورد؛ کد آپلود نمی‌کند و **migrate اجرا نمی‌شود**. مهاجرت‌های دیتابیسی که نسخهٔ جدیدتر اعمال کرده باقی می‌مانند (در این پروژه افزایشی‌اند و نسخهٔ قدیمی آن‌ها را نادیده می‌گیرد).
- پس از موفقیت، دو تگ جابه‌جا می‌شوند؛ اجرای دوباره یعنی برگشت به جلو.
- برای رفتن به یک بیلد جدیدتر از `deploy.sh` با `IMAGE_TAG=<sha>` استفاده کنید تا migrate اجرا شود.
- اولین استقرار با این روش، ایمیج‌های در حال اجرا را محلی با تگ `pre-pinning` نگه می‌دارد تا چیزی برای برگشت باشد.
- اگر migrate نیمه‌کاره شکست بخورد، `prisma migrate deploy` تا رفع دستی (`npx prisma migrate resolve ...` داخل ایمیج migrate) دوباره اجرا نمی‌شود؛ rollback خودکار برای همین migrate را اجرا نمی‌کند.

### اجرای دستی compose روی سرور

compose بدون `IMAGE_TAG` سراغ `:latest` محلی می‌رود (که پس از هر استقرار موفق به همان بیلد اشاره می‌کند). برای اطمینان، دستورهای دستی را با تگ ثبت‌شده اجرا کنید:

```bash
cd /srv/arena/app
export IMAGE_TAG=$(cat /srv/arena/.deployed-tag)
docker compose up -d --force-recreate web
```

(`docker compose pull` دستی بدون `IMAGE_TAG`، `latest` رجیستری را می‌آورد؛ استقرار استیجینگ با تگ `latest` هم همین کار را می‌کند.)

**نکتهٔ مهم:** پیش از اولین اجرا، حتماً فایل `/srv/arena/app/.env` را روی سرور ویرایش کنید و مقادیر واقعی (`SESSION_SECRET`، `ADMIN_PASSWORD`، `ANTHROPIC_API_KEY` و در صورت نیاز `SITE_ADDRESS` و `PAYMENT_DRIVER` — بخش ۹) را قرار دهید، سپس `deploy.sh` را دوباره اجرا کنید.

## ۴. دیدن لاگ‌ها

```bash
ssh -i ~/.ssh/founders_arena root@89.42.199.174
cd /srv/arena/app
docker compose logs -f web          # لاگ برنامهٔ Next.js
docker compose logs -f migrate      # لاگ migrate/seed (اجرای یک‌باره)
docker compose logs -f caddy        # لاگ ریورس‌پروکسی/HTTPS
docker compose ps                   # وضعیت سرویس‌ها
```

## ۵. پشتیبان‌گیری (backup) از دیتابیس SQLite

فایل دیتابیس در `/srv/arena/data/dev.db` روی سرور (خارج از کانتینرها) نگهداری می‌شود. برای گرفتن نسخهٔ پشتیبان امن (بدون قفل‌شدگی حین نوشتن):

```bash
ssh -i ~/.ssh/founders_arena root@89.42.199.174 \
  "docker compose -f /srv/arena/app/docker-compose.yml exec -T web \
   node -e \"require('better-sqlite3')('/app/data/dev.db').backup('/app/data/backup-$(date +%Y%m%d-%H%M).db')\""
```

یا ساده‌تر (چون بین درخواست‌ها معمولاً بی‌خطر است، برای دیتای کم‌حجم مسابقه):

```bash
scp -i ~/.ssh/founders_arena root@89.42.199.174:/srv/arena/data/dev.db ./backup-$(date +%Y%m%d-%H%M).db
```

توصیه می‌شود یک کپی دوره‌ای (مثلاً هر ساعت در روز مسابقه) از همین راه گرفته شود.

## ۶. تنظیم دامنه (HTTPS خودکار) — `festival.pegah.tech`

دامنهٔ رویداد **`festival.pegah.tech`** است و باید به **IP دوم سرور (`188.121.125.246`، کارت `eth1`)** اشاره کند، نه IP اول (`185.231.181.106` از خارج ایران و برای کاربران VPN‌دار باز نمی‌شود و Let's Encrypt هم نمی‌تواند آن را اعتبارسنجی کند — بخش ۱۰).

رکوردی که از ادمین DNS `pegah.tech` (نیم‌سرورهای `ns1..ns3.pegahtech.ir`) باید خواسته شود:

```
festival.pegah.tech.   A   188.121.125.246
```

فقط DNS ساده: بدون CDN/پروکسی (ابرآروان/کلودفلر)، بدون رکورد AAAA (سرور IPv6 ندارد)، و ترجیحاً TTL کوتاه.

**وضعیت در ۱۸ مهر ۱۴۰۵ (۱۰ اکتبر ۲۰۲۶):** رکورد هنوز ساخته نشده بود — نیم‌سرورهای خود `pegah.tech` و همین‌طور 1.1.1.1 و 8.8.8.8 برای `festival.pegah.tech` پاسخ `NXDOMAIN` می‌دادند. تا ساخته شدن رکورد، سرور روی `http://188.121.125.246` می‌ماند؛ **زودتر از آن `SITE_ADDRESS` را عوض نکنید**، چون Caddy با نام هاست فقط همان هاست را سرو می‌کند و بدون گواهی سایت برای همه از دسترس خارج می‌شود.

وقتی رکورد ساخته شد، همه‌چیز با یک اسکریپت از ماشین توسعه انجام می‌شود:

```bash
./deploy/enable-domain.sh --check     # فقط DNS را بررسی می‌کند، چیزی را تغییر نمی‌دهد
./deploy/enable-domain.sh             # DNS را بررسی و اگر درست بود HTTPS را فعال می‌کند
./deploy/enable-domain.sh --rollback  # برگشت به .env قبلی (HTTP روی IP)
```

اسکریپت:

1. از روی سرور با `dig` از 1.1.1.1 و 8.8.8.8 و نیم‌سرورهای `pegah.tech` رکورد A را می‌پرسد؛ همه باید دقیقاً `188.121.125.246` برگردانند و AAAA نباید وجود داشته باشد، وگرنه با پیام مشخص متوقف می‌شود و به سرور دست نمی‌زند.
2. از `/srv/arena/app/.env` نسخهٔ پشتیبان (`.env.bak-<timestamp>`) می‌گیرد و این سه مقدار را تنظیم می‌کند:
   ```
   SITE_ADDRESS=festival.pegah.tech
   SITE_URL=https://festival.pegah.tech
   COOKIE_SECURE=true
   ```
3. فقط `web` و `caddy` را با `--no-deps --force-recreate` دوباره می‌سازد (کانتینر یک‌بارهٔ `migrate` اجرا نمی‌شود — همان نکتهٔ `deploy.sh`).
4. تا ۳ دقیقه منتظر گواهی می‌ماند و `https://festival.pegah.tech/api/phase` را از روی سرور و از ماشین شما چک می‌کند، و ریدایرکت HTTP→HTTPS را هم تست می‌کند. اگر بالا نیامد لاگ Caddy را چاپ می‌کند و دستور `--rollback` را نشان می‌دهد.

پیش‌نیازها همین حالا روی سرور بررسی و آماده است: پورت‌های ۸۰ و ۴۴۳ در ufw باز، `acme-v02.api.letsencrypt.org` و `acme.zerossl.com` (fallback خودکار Caddy) از سرور با پاسخ ۲۰۰ در دسترس، ولوم‌های `caddy_data`/`caddy_config` برای نگه‌داری گواهی در `docker-compose.yml` تعریف شده، و مسیریابی IP دوم (جدول ۱۰۱) برقرار است.

بعد از فعال شدن:

- `deploy/deploy.sh` چک سلامت را خودش از `SITE_URL` سرور می‌خواند (`https://festival.pegah.tech/api/health`)؛ با `HEALTH_URL=...` می‌شود override کرد. برای `uptime-check.sh` آدرس را صریح بدهید: `deploy/uptime-check.sh https://festival.pegah.tech/api/health` (آدرس پیش‌فرض IP هم کار می‌کند چون ریدایرکت دنبال می‌شود).
- لینک‌های قدیمی `http://188.121.125.246/...` با 302 به `https://festival.pegah.tech/...` می‌روند: اسکریپت `LEGACY_HTTP_ADDRESS=http://188.121.125.246` و `LEGACY_REDIRECT_TO=https://festival.pegah.tech` را هم در `.env` می‌گذارد (بلوک دوم Caddyfile). بدون این دو مقدار آن بلوک بی‌اثر است. `--rollback` با برگرداندن `.env` قبلی آن‌ها را هم برمی‌دارد.
- `Strict-Transport-Security` فقط روی پاسخ‌های HTTPS فرستاده می‌شود.
- کاربرانی که روی `http://188.121.125.246` لاگین بودند باید دوباره وارد شوند (کوکی `Secure` و روی دامنه است).
- اعلان‌های Push و نصب PWA که به HTTPS نیاز دارند خودکار فعال می‌شوند.

اگر دامنه‌ای تنظیم نشود، `SITE_ADDRESS` پیش‌فرض `:80` است و سایت فقط روی HTTP با IP سرور در دسترس است؛ در این حالت `COOKIE_SECURE=false` باید در `.env` بماند (کد در `src/lib/auth.ts` فقط با مقدار صریح `false` فلگ Secure را برمی‌دارد).

## ۷. کاربران آزمایشی و لیست سفید

- **لیست سفید** به‌طور پیش‌فرض روشن است: فقط ایمیل‌های فهرست `/admin/whitelist` می‌توانند ثبت‌نام کنند. بقیه در صفحهٔ ورود/ثبت‌نام به فرم «درخواست دسترسی» (`/access-request`: نام، نام خانوادگی، سمت، واحد سازمانی) هدایت می‌شوند و ادمین در همان صفحه تأیید یا رد می‌کند. کاربرانی که پیش از این تغییر حساب داشتند، در مهاجرت خودکار به فهرست اضافه شده‌اند. از همان صفحه می‌شود لیست سفید را خاموش کرد.
- **کاربران آزمایشی** (دامنهٔ `arena.test`، رمزها داخل `prisma/seed-test-users.ts`):
  - لوکال: `npm run db:seed-test`
  - استیجینگ: `SEED_TEST_USERS=1` را در `.env.staging` بگذارید؛ سرویس `migrate` هنگام استقرار آن‌ها را می‌سازد.
  - در production این اسکریپت بدون `ALLOW_TEST_USERS=1` اجرا نمی‌شود، چون رمزها در مخزن عمومی‌اند.
  - هر کاربر آزمایشی یک شمارهٔ آزمایشی هم دارد (`09999999900` برای ادمین تا `09999999908`). شماره‌های `099999999xx` هرگز پیامک واقعی نمی‌گیرند.
  - دو تیم سه‌نفرهٔ آماده وجود دارد: «تیم آزمایشی الف» (test1 تا test3) و «تیم آزمایشی ب» (test4 تا test6). test7 و test8 بی‌تیم‌اند تا «شرکت فردی»، تیم دونفره و حمایت کاربر بی‌تیم را تست کنید. تیم سرپرست ندارد و هر عضو می‌تواند کارهای تیم را انجام دهد.
  - برای تست خرید سکه روی استیجینگ، درگاه آزمایشی را با `PAYMENT_DRIVER=fake` و `PAYMENT_FAKE_ALLOWED=1` در `.env.staging` روشن کنید (بخش ۹).

## ۸. ورود با موبایل و کد پیامکی (OTP)

- ورود با ایمیل/رمز همیشه فعال است. ورود با شمارهٔ موبایل و کد شش‌رقمی فقط وقتی فعال است که درایور پیامک تنظیم شده باشد:
  - `SMS_PROVIDER`: در محیط توسعه پیش‌فرض `console` است (پیامک فقط در لاگ سرور چاپ می‌شود). در production خالی یعنی ورود پیامکی خاموش است و فرم‌ها فقط ایمیل را نشان می‌دهند. درایور سرویس پیامک واقعی بعد از رسیدن مستندات به `src/lib/sms.ts` اضافه می‌شود.
  - `OTP_ECHO=1`: فقط برای استیجینگ. کد را در خود صفحه نشان می‌دهد، آن هم فقط وقتی پیامک واقعی نمی‌رود (درایور `console` یا شمارهٔ آزمایشی). در production آن را روشن نکنید.
- کد دو دقیقه اعتبار دارد و یک‌بارمصرف است. پنج تلاش اشتباه کد را باطل می‌کند. بین دو ارسال به یک شماره ۶۰ ثانیه فاصله لازم است و هر شماره حداکثر ۵ کد در ساعت می‌گیرد (`OTP_IP_RATE` و `OTP_VERIFY_PHONE_RATE` سقف‌های IP و تلاش را تنظیم می‌کنند).
- کاربر شماره را در ثبت‌نام (اختیاری) یا در پروفایل با کد تأیید می‌کند. ادمین هم می‌تواند از `/admin/users` شماره را مستقیم ثبت کند. شمارهٔ فرم «درخواست دسترسی» پس از تأیید به لیست سفید می‌رود.

## ۹. پرداخت و خرید سکه

بازیکن‌ها می‌توانند با پول سکه بخرند (هر سکه هزار تومان). کل مبلغ پرداخت‌شده به صندوق جایزه اضافه می‌شود. درایور پرداخت با متغیر محیطی `PAYMENT_DRIVER` انتخاب می‌شود (`src/lib/coins.ts`):

- `manual` (پیش‌فرض در production): درگاهی در کار نیست. سفارش «در انتظار» می‌ماند و برگزارکننده پس از دریافت وجه، آن را در `/admin/coins` تأیید یا رد می‌کند. متن راهنمای پرداخت (شمارهٔ کارت/حساب و نحوهٔ ارسال رسید) را در همان صفحه بنویسید.
- `fake` (پیش‌فرض بیرون از production): درگاه آزمایشی (`/coins/fake-gateway`) که بدون پول واقعی پرداخت را شبیه‌سازی می‌کند. در production فقط با `PAYMENT_FAKE_ALLOWED=1` فعال می‌شود؛ بدون آن، بی‌صدا `manual` استفاده می‌شود.

روی سرور اصلی `PAYMENT_DRIVER` را خالی بگذارید یا `manual` کنید و **هرگز** `PAYMENT_FAKE_ALLOWED=1` را در `/srv/arena/app/.env` نگذارید، وگرنه هر کسی بدون پرداخت سکه می‌گیرد. روی استیجینگ (که آن هم با `NODE_ENV=production` اجرا می‌شود)، برای تست هر دو را در `.env.staging` تنظیم کنید:

```
PAYMENT_DRIVER=fake
PAYMENT_FAKE_ALLOWED=1
```

بعد از تغییر `.env`، سرویس `web` را دوباره بسازید تا مقدار تازه را بخواند: `docker compose up -d --force-recreate web`.

درگاه واقعی بعداً با پیاده‌سازی رابط `PaymentDriver` در `src/lib/coins.ts` و ثبت آن در `getPaymentDriver()` و `driverByName()` اضافه می‌شود. جزئیات جریان سفارش و نحوهٔ افزودن درگاه در `docs/ops.md` بخش ۹ است.

## ۱۰. سرور ابرآروان (تهران، دیتاسنتر فروغ)

سرور دوم روی ابرآروان در دیتاسنتر فروغ تهران (`ir-thr-fr1`) است: پلن `c5-medium1` (۲ هسته، ۴ گیگ رم، ۲۵ گیگ دیسک، Ubuntu 24.04) با کلید SSH `~/.ssh/tapsell_qeysar`. ورود SSH فقط با کلید است.

آدرس اصلی سایت **`http://188.121.125.246`** است (`SITE_URL` روی سرور همین است) تا وقتی دامنهٔ `festival.pegah.tech` به همین IP وصل شود (بخش ۶). سرور دو IP عمومی دارد:

| IP | کارت شبکه | از داخل ایران | از خارج و با VPN |
|---|---|---|---|
| `188.121.125.246` | `eth1` | باز می‌شود | باز می‌شود |
| `185.231.181.106` | `eth0` | باز می‌شود | باز **نمی‌شود** |

در مهر ۱۴۰۵ IP اول سرور (`185.231.181.106`) از خارج ایران روی هیچ پورتی در دسترس نبود، در حالی که فایروال ابرآروان و ufw همه‌چیز را باز گذاشته بودند. این محدودیت در سطح شبکهٔ کشور است، نه روی سرور. هر کاربری که VPN روشن دارد از دید سرور خارجی است و سایت برایش باز نمی‌شد. برای همین یک IP دوم از پنل/API ابرآروان (`add-public-ip`) گرفته شد که از خارج در دسترس است. هر IP تازه را پیش از استفاده با [check-host.net](https://check-host.net) از چند کشور تست کنید.

IP دوم به مسیریابی جداگانه نیاز دارد، چون پاسخ اتصالی که از `eth1` آمده باید از همان `eth1` برگردد:

- `/etc/netplan/60-arena-eth1.yaml`: جدول مسیریابی `101` با gateway `188.121.124.1`، و قانون‌هایی برای ترافیک با مبدأ IP دوم یا با mark `0x65`.
- `arena-eth1-mark.service` (اسکریپت `/usr/local/sbin/arena-eth1-mark.sh`): اتصال‌های ورودی از `eth1` را با connmark علامت می‌زند تا پاسخ کانتینرهای Docker (که از DNAT رد می‌شوند) هم از `eth1` برگردند.
- `/etc/sysctl.d/98-arena-rpfilter.conf`: `rp_filter` شُل (`2`).

دیپلوی با هر دو IP کار می‌کند:

```bash
SERVER=root@188.121.125.246 KEY=~/.ssh/tapsell_qeysar ./deploy/deploy.sh
```

**پیش از ساخت سرور تازه، دسترسی اینترنت خارجی را تست کنید.** در مهر ۱۴۰۵ سرورهای منطقهٔ قیصر (`ir-southwest1-a`) و دیتاسنتر بامداد و یکی از IPهای سیمین به ghcr.io و npm تقریباً دسترسی نداشتند (چند کیلوبایت بر ثانیه یا هیچ). سرورهای فروغ و یک سرور دیگر سیمین بیش از ۱۰ مگابایت بر ثانیه می‌گرفتند. دسترسی به IP بستگی دارد، پس هر سرور تازه را جدا تست کنید:

```bash
curl -s -o /dev/null -m 20 -w "%{speed_download}
" https://registry.npmjs.org/next/-/next-15.0.0.tgz
```

اگر سرور مجبور است در شبکهٔ محدود بماند، این تنظیم‌ها کمک می‌کنند:

- آرشیو کند Ubuntu: `APT_MIRROR=http://mirror.iranserver.com/ubuntu/ bash server-setup.sh`
- `download.docker.com` کند: اسکریپت در صورت شکست، خودش `docker.io` و `docker-compose-v2` اوبونتو را نصب می‌کند.
- سرور بی IPv6: اسکریپت IPv6 را خاموش می‌کند تا Docker سراغ رکوردهای AAAA نرود.
- قطع شدن دانلود از ghcr: `deploy.sh` تا ۸ بار دوباره تلاش می‌کند.
- `server-setup.sh --harden` فایل `/etc/ssh/sshd_config.d/00-arena-hardening.conf` را می‌سازد. ایمیج ابرآروان فایل `01-arvan-root-login.conf` را با `PasswordAuthentication yes` دارد و چون sshd اولین مقدار را نگه می‌دارد، تغییر خود `sshd_config` کافی نیست.

## ۱۱. منابع، کاربر اجرا، تک‌نمونه بودن و استیجینگ

### فقط یک نمونه از `web`

اسکجولر بازی، محدودیت نرخ (`src/lib/rate-limit.ts`)، کش‌های کوتاه (`src/lib/ttl-cache.ts`) و پخش SSE حراج همه در حافظهٔ همان یک پردازه‌اند. **هرگز `web` را scale نکنید** (`--scale web=2` یا replicas) — دو اسکجولر هم‌زمان فازها و حراج‌ها را دوبار جلو می‌برند و کاربران SSE فقط نیمی از رویدادها را می‌بینند.

### سقف منابع (`docker-compose.yml`)

سرور: ۲ هسته، ۳٫۹ گیگ رم. سقف‌ها طوری‌اند که میزبان و پیک migrate جا داشته باشند:

| سرویس | `mem_limit` | `cpus` | توضیح |
|---|---|---|---|
| `web` | 1536m | 1.5 | `NODE_OPTIONS=--max-old-space-size=1024` تا V8 پیش از OOM-kill کرنل GC کند |
| `migrate` | 1g | 1.5 | یک‌باره، فقط هنگام استقرار |
| `backup` | 512m | 0.5 | |
| `caddy` | 256m | 0.5 | ایمیج پین‌شدهٔ `caddy:2.11.4` (ارتقا = تغییر آگاهانهٔ همین خط) |

اگر `web` با OOM ری‌استارت شد (`docker inspect app-web-1 --format '{{.State.OOMKilled}}'`)، `mem_limit` و `--max-old-space-size` را با هم بالا ببرید.

### اجرا با کاربر غیر root

هر سه سرویس `web`، `migrate` و `backup` با کاربر `node` (uid/gid 1000) اجرا می‌شوند. اسکریپت `docker/drop-privs.sh` (ENTRYPOINT ایمیج‌ها) با root شروع می‌کند، مالکیت `/app/data` (و برای backup، `/backups`) را — فقط فایل‌هایی که مالکشان `node` نیست — به `1000:1000` می‌دهد و بعد با `setpriv` به `node` سقوط می‌کند. بنابراین روی میزبان، `/srv/arena/data` و `/srv/arena/backups` پس از اولین استقرار مالکیت `1000:1000` می‌گیرند؛ این عمدی است. همهٔ سرویس‌هایی که دیتابیس را باز می‌کنند باید با یک کاربر اجرا شوند، وگرنه فایل `dev.db-wal`/`-shm` ساخته‌شده با root برای اپ فقط‌خواندنی می‌شود.

- کار دستی لازم نیست؛ اگر فایلی را با root در `/srv/arena/data` کپی کردید (مثلاً restore)، ری‌استارت بعدی خودش مالکیت را درست می‌کند. برای درست کردن فوری: `chown -R 1000:1000 /srv/arena/data /srv/arena/backups`.
- کلید اضطراری: `RUN_AS_USER=root` در `/srv/arena/app/.env` و سپس `docker compose up -d --force-recreate web backup` (با `IMAGE_TAG` بالا) رفتار قدیمی (اجرا با root) را برمی‌گرداند.

### استیجینگ فقط از طریق تونل SSH

استیجینگ (`deploy/deploy-staging.sh`، `docker-compose.staging.yml`) فقط روی `127.0.0.1:8080` سرور گوش می‌دهد و از اینترنت در دسترس نیست (کاربران آزمایشی، درگاه پرداخت آزمایشی، بدون CSP). برای دیدنش:

```bash
ssh -i ~/.ssh/tapsell_qeysar -N -L 8080:127.0.0.1:8080 root@188.121.125.246
# سپس در مرورگر: http://localhost:8080
```

سقف منابع استیجینگ کوچک است (web: 768m / 0.5 cpu، migrate: 512m) تا هرگز production را گرسنه نگذارد. یک بیلد مشخص را با `IMAGE_TAG=<sha> ./deploy/deploy-staging.sh` روی استیجینگ ببرید.

### چک‌های سلامت

- `/api/health`: دیتابیس + اسکجولر؛ در صورت مشکل ۵۰۳. healthcheck داکر، `deploy.sh` و `uptime-check.sh` از این استفاده می‌کنند. `uptime-check.sh` فقط وقتی به `/api/phase` برمی‌گردد که `/api/health` وجود نداشته باشد (۴۰۴)؛ ۵۰۳ همیشه هشدار است.
- `/api/health?probe=db`: فقط دیتابیس — `health_uri` در Caddyfile. اسکجولرِ متوقف نباید Caddy را وادار کند کل سایت را ۵۰۳ کند.

### CSP

CSP سراسری در Caddyfile است و فقط وقتی گذاشته می‌شود که اپ خودش CSP نفرستاده باشد (`/covers/*` و `/uploads/*` سیاست سخت‌گیرانهٔ خودشان را نگه می‌دارند). `frame-src` فقط یوتیوب (`www.youtube.com`، `www.youtube-nocookie.com`) و آپارات (`www.aparat.com`) است و `media-src` فقط خود سایت؛ لینک مستقیم فایل ویدیو روی میزبان دیگر به‌عنوان تیزر در مرورگر بلاک می‌شود — برای مجاز کردن یک میزبان، آن را به `media-src` در Caddyfile اضافه کنید.
