# راهنمای عملیات (Ops) — میدان بنیان‌گذاران تپسل

این سند مکمل `deploy/README-deploy.md` است و پشتیبان‌گیری، ریستور، محیط staging،
مانیتورینگ uptime، سخت‌سازی سرور، HTTPS و دیپلوی نزدیک به بدون-داون‌تایم را
پوشش می‌دهد. دستورها انگلیسی/شل هستند، توضیح‌ها فارسی.

## ۱. پشتیبان‌گیری (Backups)

### چطور کار می‌کند

سرویس `backup` در `docker-compose.yml` روی `target: tools` همان Dockerfile ساخته
می‌شود (که Node کامل + `better-sqlite3` دارد) و به‌جای `docker/entrypoint.sh`،
`scripts/backup.mjs` را اجرا می‌کند. این اسکریپت:

- هر `BACKUP_INTERVAL_MIN` دقیقه (پیش‌فرض ۱۵) یک بک‌آپ آنلاین از دیتابیس
  می‌گیرد، با API رسمی `db.backup()` در `better-sqlite3` (بدون قفل کردن
  نویسنده‌ها — «آنلاین بک‌آپ»).
- روی نسخهٔ بک‌آپ‌شده `PRAGMA integrity_check` اجرا می‌کند؛ اگر «ok» نبود،
  فایل را نگه نمی‌دارد و خطا لاگ می‌کند.
- فایل سالم را gzip می‌کند و در `BACKUP_DIR` (پیش‌فرض `/backups`، که روی
  `/srv/arena/backups` مپ می‌شود) با نام `dev-YYYYMMDD-HHMMSS.db.gz` ذخیره
  می‌کند.
- نگه‌داری (retention): آخرین `BACKUP_KEEP` بک‌آپِ بازه‌ای (پیش‌فرض ۹۶، یعنی
  با فاصلهٔ ۱۵ دقیقه ≈ یک روز) به‌علاوهٔ یک بک‌آپ در روز برای ۱۴ روز گذشته
  نگه داشته می‌شود؛ بقیه پاک می‌شوند.
- هر اجرا دقیقاً یک خط JSON در stdout لاگ می‌کند (قابل جمع‌آوری با
  `docker compose logs backup`).

نکتهٔ مهم دربارهٔ mount: چون دیتابیس در حالت WAL است، حتی خوانندهٔ صرف هم باید
بایت‌های read-mark را در فایل `-shm` بنویسد تا با نویسنده‌ها هماهنگ شود؛ به
همین دلیل `/srv/arena/data` برای سرویس `backup` با دسترسی خواندن/نوشتن
(rw، نه ro) mount شده — نه چون backup.mjs چیزی در dev.db خودش تغییر می‌دهد.

### دستورهای سرور

```bash
# اجرای یک‌بارهٔ دستی (مثلاً بلافاصله قبل از یک تغییر پرخطر):
docker compose run --rm backup node /app/scripts/backup.mjs --once

# دیدن لاگ‌های بک‌آپ خودکار:
docker compose logs -f backup

# لیست بک‌آپ‌های موجود روی سرور:
ls -lh /srv/arena/backups
```

### کشیدن بک‌آپ‌ها به لپ‌تاپ

از ماشین توسعه:

```bash
SERVER=root@89.42.199.174 KEY=~/.ssh/founders_arena ./deploy/pull-backups.sh
# یا با تعداد دلخواه:
SERVER=root@89.42.199.174 KEY=~/.ssh/founders_arena COUNT=10 ./deploy/pull-backups.sh
```

بک‌آپ‌ها در `./backups/` محلی ذخیره می‌شوند (skip می‌کند اگر فایل از قبل
موجود باشد).

## ۲. ریستور (Restore) — تمرین و اجرای واقعی

### روی سرور (واقعی)

```bash
deploy/restore.sh /srv/arena/backups/dev-20260923-163559.db.gz
```

این اسکریپت: `web` را متوقف می‌کند، یک نسخهٔ ایمنی از دیتابیس فعلی نگه
می‌دارد (`dev.db.before-restore-<timestamp>`)، بک‌آپ را gunzip و جایگزین
می‌کند، با یک کانتینر یک‌بارهٔ `migrate` (که `better-sqlite3` دارد)
`PRAGMA integrity_check` اجرا می‌کند، و اگر سالم بود `web` را دوباره بالا
می‌آورد. اگر integrity check رد شود، نسخهٔ ایمنی خودکار برمی‌گردد و
اسکریپت با کد خطا خارج می‌شود.

### تمرین محلی (local drill) که اجرا شد

این تمرین به‌صورت end-to-end روی یک دیتابیس موقت (نه دیتابیس واقعی پروژه)
اجرا و تأیید شد:

```bash
DATABASE_URL=file:<tmp>/drill.db npx prisma migrate deploy
# insert 500 rows into Setting via better-sqlite3
DATABASE_URL=file:<tmp>/drill.db BACKUP_DIR=<tmp>/backups node scripts/backup.mjs --once
# gunzip newest backup, compare row counts + PRAGMA integrity_check
```

نتایج تمرین (سیستم توسعه، Windows، بدون بار همزمان):

| مرحله                                    | زمان        |
| ----------------------------------------- | ----------- |
| `prisma migrate deploy` (schema کامل ۲۲ جدول) | چند ثانیه (اولین بار؛ به کش npx بستگی دارد) |
| درج ۵۰۰ ردیف تستی                          | ۱۱۳ میلی‌ثانیه |
| `backup.mjs --once` (backup+integrity+gzip) | ۴۳ میلی‌ثانیه (داخلی) / ۱۵۳ میلی‌ثانیه (با شروع Node) |
| gunzip بازیابی                             | ۷۹ میلی‌ثانیه |
| نتیجه                                     | تعداد ردیف مبدأ = مقصد = ۵۰۰، `integrity_check = ok` |

نتیجه: با دیتابیس واقعی رویداد (به مراتب کوچک‌تر از دیتابیس‌های تولیدی
معمول) کل چرخهٔ backup+restore زیر یک ثانیه طول می‌کشد؛ زمان غالب در عمل صرف
راه‌اندازی کانتینر/SSH خواهد شد نه خودِ I/O.

## ۳. محیط Staging

`docker-compose.staging.yml` یک پروژهٔ Compose کاملاً جدا است (`-p
arena-staging`)، با `migrate`/`web` مخصوص خودش (بدون caddy)، روی
`/srv/arena/staging-data` و پورت `8080:3000`. هیچ volume یا شبکه‌ای با
production مشترک نیست.

```bash
# اولین بار: .env.staging را روی سرور در /srv/arena/staging-app بسازید
# (یک کپی از .env.example با SESSION_SECRET/ADMIN_PASSWORD متفاوت؛
#  SITE_ADDRESS لازم نیست چون staging کدی caddy ندارد).

SERVER=root@89.42.199.174 KEY=~/.ssh/founders_arena ./deploy/deploy-staging.sh
```

بعد از دیپلوی، staging روی `http://89.42.199.174:8080` در دسترس است.
برای متوقف کردنش، روی سرور:

```bash
cd /srv/arena/staging-app
docker compose -p arena-staging -f docker-compose.staging.yml down
```

(این دستور فقط کانتینرهای staging را لمس می‌کند؛ چون پروژهٔ Compose آن
جداست، production دست‌نخورده می‌ماند.)

## ۴. مانیتورینگ Uptime

`deploy/uptime-check.sh` یک URL را curl می‌کند (پیش‌فرض
`http://89.42.199.174/api/health`، با fallback به `/api/phase`) و در صورت
شکست، اگر `ALERT_WEBHOOK_URL` ست شده باشد یک JSON POST به آن می‌فرستد.

### ثبت در یک مانیتور رایگان خارجی (UptimeRobot یا مشابه)

۱. در [uptimerobot.com](https://uptimerobot.com) (یا مشابه مثل Better
   Uptime / Freshping) ثبت‌نام کنید.
۲. یک Monitor نوع HTTP(s) بسازید با آدرس
   `http://89.42.199.174/api/health` و بازهٔ چک هر ۵ دقیقه.
۳. یک Alert Contact (ایمیل/تلگرام/Slack webhook) وصل کنید.
۴. (اختیاری) در تنظیمات UptimeRobot یک Webhook alert هم بسازید که به یک
   Slack/Discord incoming-webhook شما POST کند، و همان URL را به‌عنوان
   `ALERT_WEBHOOK_URL` برای اسکریپت محلی زیر هم استفاده کنید (دو لایهٔ
   هشدار مستقل از هم).

### اجرا با cron از یک ماشین دیگر (نه خودِ سرور آرنا)

روی یک ماشین دیگر (لپ‌تاپ همیشه‌روشن، یا یک VPS کوچک دیگر):

```bash
crontab -e
# هر ۵ دقیقه:
*/5 * * * * ALERT_WEBHOOK_URL="https://hooks.slack.com/..." /path/to/deploy/uptime-check.sh >> /var/log/arena-uptime.log 2>&1
```

عمداً از خودِ سرور آرنا اجرا نمی‌شود، چون اگر کل سرور down باشد چیزی برای
اجرای cron نیست.

## ۵. سخت‌سازی سرور (Hardening)

`deploy/harden-server.sh` را روی سرور اجرا کنید (این اسکریپت توسط این agent
اجرا **نشده**؛ فقط نوشته شده — مسئول دیپلوی آن را دستی اجرا می‌کند):

```bash
scp -i ~/.ssh/founders_arena deploy/harden-server.sh root@89.42.199.174:/root/
ssh -i ~/.ssh/founders_arena root@89.42.199.174 'bash /root/harden-server.sh'
```

این اسکریپت idempotent است (اجرای دوباره مشکلی ایجاد نمی‌کند) و:

- `ufw`: پیش‌فرض deny روی ورودی، فقط ۲۲/۸۰/۴۴۳/۸۰۸۰ (staging) باز.
- `fail2ban`: jail مخصوص `sshd` را فعال می‌کند.
- `unattended-upgrades`: آپدیت‌های امنیتی خودکار.
- SSH: `PasswordAuthentication no` و `PermitRootLogin prohibit-password`،
  **فقط بعد از** این‌که چک کرد `/root/.ssh/authorized_keys` خالی نیست (وگرنه
  ممکن است خودتان قفل شوید بیرون سرور)، و با `sshd -t` قبل از reload اعتبارسنجی
  می‌کند — اگر config نامعتبر باشد، هیچ تغییری اعمال/reload نمی‌شود.

⚠️ قبل از اجرا مطمئن شوید با کلید SSH (نه رمز) می‌توانید وصل شوید — این
اسکریپت اگر authorized_keys خالی باشد از کار امتناع می‌کند، ولی بهتر است
خودتان هم قبلش تست کنید.

## ۶. HTTPS

فعلاً سایت روی `SITE_ADDRESS=:80` (HTTP ساده روی IP) سرو می‌شود، طبق
`.env.example`. برای فعال کردن HTTPS واقعی:

۱. یک دامنه بخرید/داشته باشید و DNS آن را (رکورد A) به IP سرور
   (`89.42.199.174`) اشاره دهید. منتظر بمانید تا propagate شود (`dig
   your-domain.com` باید IP سرور را برگرداند).
۲. در `.env` روی سرور، `SITE_ADDRESS` را از `:80` به دامنه تغییر دهید،
   مثلاً:
   ```
   SITE_ADDRESS=arena.example.com
   ```
   (بدون `http://`/`https://` — فقط نام هاست؛ همان‌طور که در Caddyfile و
   `.env.example` مستند شده. Caddy خودش با Let's Encrypt گواهی می‌گیرد و
   HTTP→HTTPS ریدایرکت می‌کند.)
۳. در `.env`، `COOKIE_SECURE` را از `"false"` حذف کنید یا به `"true"`
   تغییر دهید — کد در `src/lib/auth.ts` این‌طور است:
   `secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false"`
   یعنی فقط با `COOKIE_SECURE="false"` صریح غیرفعال می‌شود؛ حذف کامل متغیر
   یا هر مقدار دیگری کافی است تا کوکی‌ها با فلگ `Secure` ست شوند (که روی
   HTTP ساده باعث می‌شد مرورگر اصلاً کوکی را قبول نکند — به همین دلیل
   پیش‌فرض روی IP ساده `false` است).
۴. `docker compose up -d --force-recreate caddy` تا Caddy با آدرس جدید
   ری‌استارت شود و گواهی بگیرد.
۵. Push notification و PWA (نصب روی صفحهٔ اصلی) هر دو نیازمند HTTPS واقعی
   هستند (Service Worker و `PushManager` در مرورگرها روی HTTP ساده — غیر از
   `localhost` — غیرفعال‌اند)؛ تا وقتی سایت روی `http://89.42.199.174`
   است، toggle اعلان‌ها پیام «نیاز به HTTPS» نشان می‌دهد (طبق کامنت
   `.env.example`) — بعد از این مراحل خودش فعال می‌شود.

## ۷. دیپلوی نزدیک به بدون-داون‌تایم

- ایمیج‌ها روی GitHub Actions ساخته و به ghcr.io پوش می‌شوند
  (`.github/workflows/build-images.yml`)؛ `deploy/deploy.sh` روی سرور فقط
  `docker compose pull migrate web` و بعد `docker compose up -d` را اجرا
  می‌کند. پس داون‌تایم واقعی فقط زمان ری‌استارت کانتینر است، نه زمان build.
  (روی این سرور اصلاً build نمی‌کنیم: دسترسی شبکه به registry.npmjs.org
  پایدار نیست. سرویس `backup` و استیجینگ هم همان ایمیج‌های آماده را
  استفاده می‌کنند، نه `build:`.)
- در Caddyfile، هر دو `reverse_proxy` (هندلر SSE و هندلر عادی)
  `lb_try_duration 30s` و `lb_try_interval 250ms` دارند: اگر `web` دقیقاً
  در لحظهٔ یک درخواست در حال ری‌استارت باشد، Caddy تا ۳۰ ثانیه هر ۲۵۰
  میلی‌ثانیه دوباره تلاش می‌کند به‌جای برگرداندن فوری ۵۰۲.
- با این حال، **دیپلوی را فقط بین فازهای رویداد انجام دهید**، نه وسط یک
  فاز حساس مثل حراج زنده — به `docs/runbook-event-day.md` نگاه کنید.

## ۸. متغیرهای محیطی جدید

این agent فایل `.env.example` را ویرایش نکرده (طبق دستور)، ولی این
سرویس‌ها/اسکریپت‌های جدید متغیرهای محیطی زیر را می‌خوانند (همه اختیاری با
مقدار پیش‌فرض منطقی، به‌جز جایی که ذکر شده):

| متغیر | پیش‌فرض | کجا استفاده می‌شود |
|---|---|---|
| `BACKUP_DIR` | `/backups` | `scripts/backup.mjs`, سرویس `backup` |
| `BACKUP_INTERVAL_MIN` | `15` | `scripts/backup.mjs`, سرویس `backup` |
| `BACKUP_KEEP` | `96` | `scripts/backup.mjs`, سرویس `backup` |
| `ALERT_WEBHOOK_URL` | (خالی = بدون هشدار) | `deploy/uptime-check.sh` |
| `FALLBACK_URL` | `.../api/phase` | `deploy/uptime-check.sh` |
| `TIMEOUT_SECS` | `10` | `deploy/uptime-check.sh` |
| `COMPOSE_DIR` | `/srv/arena/app` | `deploy/restore.sh` |
| `DB_PATH` | `/srv/arena/data/dev.db` | `deploy/restore.sh` |
| `REMOTE_BACKUP_DIR` | `/srv/arena/backups` | `deploy/pull-backups.sh` |
| `LOCAL_DIR` | `./backups` | `deploy/pull-backups.sh` |
| `COUNT` | `5` | `deploy/pull-backups.sh` |
| `PROJECT` | `arena-staging` | `deploy/deploy-staging.sh` |
| `REMOTE_DIR` | `/srv/arena/staging-app` | `deploy/deploy-staging.sh` |
| `ALLOW_RESET` | (خالی = امتناع در production) | `scripts/reset-game.ts` |

`.env.staging` هم یک فایل جدید است (نه متغیر) که باید روی سرور در
`/srv/arena/staging-app/.env.staging` ساخته شود؛ شکلش دقیقاً مثل `.env`
است (کپی از `.env.example` با مقادیر جدا برای staging).
