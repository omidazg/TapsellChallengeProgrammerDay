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

از روی ماشین توسعه (Windows/Git Bash، یا هر شل POSIX)، از ریشهٔ پروژه:

```bash
SERVER=root@89.42.199.174 KEY=~/.ssh/founders_arena ./deploy/deploy.sh
```

این اسکریپت:
1. کد پروژه را (بدون `node_modules`، `.next`، `data`، `.git`) روی سرور در `/srv/arena/app` قرار می‌دهد.
2. اگر فایل `.env` روی سرور نبود، از روی `.env.example` می‌سازد و هشدار می‌دهد که مقادیر را ویرایش کنید.
3. `docker compose up -d --build` را روی سرور اجرا می‌کند (سرویس‌های `migrate`، `web`، `caddy`).
4. سلامت سرویس را با `curl` به آدرس `http://89.42.199.174/api/phase` بررسی می‌کند.

**نکتهٔ مهم:** پیش از اولین اجرا، حتماً فایل `/srv/arena/app/.env` را روی سرور ویرایش کنید و مقادیر واقعی (`SESSION_SECRET`، `ADMIN_PASSWORD`، `ANTHROPIC_API_KEY` و در صورت نیاز `SITE_ADDRESS` و `PAYMENT_DRIVER` — بخش ۹) را قرار دهید:

```bash
ssh -i ~/.ssh/founders_arena root@89.42.199.174
nano /srv/arena/app/.env
cd /srv/arena/app && docker compose up -d --build
```

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

## ۶. تنظیم دامنه (HTTPS خودکار)

اگر یک دامنه (مثلاً `arena.tapsell.ir`) به IP سرور اشاره کند، کافی‌ست در `/srv/arena/app/.env` مقدار زیر را تنظیم کنید:

```
SITE_ADDRESS=arena.tapsell.ir
```

سپس:

```bash
cd /srv/arena/app && docker compose up -d
```

Caddy به‌صورت خودکار گواهی HTTPS (Let's Encrypt) می‌گیرد و از آن پس سایت روی `https://arena.tapsell.ir` در دسترس است. اگر دامنه‌ای تنظیم نشود، `SITE_ADDRESS` پیش‌فرض `:80` است و سایت فقط روی HTTP (پورت ۸۰) با IP سرور در دسترس خواهد بود؛ در این حالت باید `COOKIE_SECURE=false` در `.env` باقی بماند (چون HTTPS وجود ندارد). وقتی دامنه و HTTPS فعال شد، `COOKIE_SECURE=true` را هم تنظیم کنید (به شرط اینکه کد برنامه از آن استفاده کند).

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

سرور دوم روی ابرآروان در دیتاسنتر فروغ تهران (`ir-thr-fr1`) است: پلن `c5-medium1` (۲ هسته، ۴ گیگ رم، ۲۵ گیگ دیسک، Ubuntu 24.04) با IP `185.231.181.106` و کلید SSH `~/.ssh/tapsell_qeysar`. ورود SSH فقط با کلید است.

```bash
SERVER=root@185.231.181.106 KEY=~/.ssh/tapsell_qeysar ./deploy/deploy.sh
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
