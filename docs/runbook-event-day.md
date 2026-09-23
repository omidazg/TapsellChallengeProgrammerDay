# Runbook روز رویداد — میدان بنیان‌گذاران تپسل

مرجع سریع برای روز اجرای واقعی. جزئیات فنی هر بخش در `docs/ops.md` و
`deploy/README-deploy.md` است؛ این‌جا فقط چک‌لیست و اقدام است.

## پیش از رویداد (Pre-event checklist)

- [ ] آخرین کد با `deploy/deploy.sh` روی سرور دیپلوی و health-check
      (`curl http://89.42.199.174/api/phase`) سبز شده.
- [ ] `deploy/harden-server.sh` روی سرور اجرا شده (ufw/fail2ban/unattended-upgrades/SSH).
- [ ] سرویس `backup` بالاست و حداقل یک بک‌آپ موفق در لاگ دارد:
      ```bash
      docker compose ps backup
      docker compose logs --tail=5 backup
      ```
- [ ] یک بک‌آپ دستی تازه گرفته و به لپ‌تاپ کشیده شده (off-server، برای
      شبی که سرور کلاً در دسترس نیست):
      ```bash
      docker compose run --rm backup node /app/scripts/backup.mjs --once
      SERVER=root@89.42.199.174 KEY=~/.ssh/founders_arena ./deploy/pull-backups.sh
      ```
- [ ] یک تمرین ریستور (drill) روی staging یا یک کپی محلی انجام شده — نه
      روی دیتابیس واقعی رویداد.
- [ ] مانیتور uptime (UptimeRobot یا مشابه) روی
      `http://89.42.199.174/api/health` فعال است و یک هشدار تست دریافت شده.
- [ ] `scripts/reset-game.ts --yes` روی staging تست شده (نه production) تا
      مطمئن شوید قبل از شروع واقعی، اگر لازم شد، بازنشانی درست کار می‌کند.
- [ ] فاز بازی روی `REGISTRATION` است (یا هر فاز شروع برنامه‌ریزی‌شده).
- [ ] اعلانیه‌ها (Announcement) برای روز رویداد آماده و `active` هستند.

## در حین رویداد (During the event)

- **دیپلوی فقط بین فازها انجام شود**، هرگز وسط یک فاز حساس (مخصوصاً
  `AUCTION` یا لحظات پایانی `MARKET`). حتی با `lb_try_duration`/
  `lb_try_interval` در Caddy (که تا ۳۰ ثانیه صبر می‌کند)، یک ری‌استارت
  کانتینر وسط حراج زنده تجربهٔ بدی می‌سازد. قبل از دیپلوی:
  1. مطمئن شوید در یک گپ بین فازها هستید (نه در حال شمارش معکوس یک حراج).
  2. `SERVER=... KEY=... ./deploy/deploy.sh` را اجرا کنید (build جدا از up
     است، پس داون‌تایم واقعی چند ثانیه‌ای).
  3. بلافاصله `curl http://89.42.199.174/api/phase` را چک کنید.
- بک‌آپ‌های خودکار هر ۱۵ دقیقه ادامه دارند؛ نیازی به کار دستی نیست مگر
  بخواهید قبل از یک عملیات پرخطر (مثل تغییر فاز یا اجرای settlement) یک
  بک‌آپ فوری بگیرید:
  ```bash
  docker compose run --rm backup node /app/scripts/backup.mjs --once
  ```
- اگر مانیتور uptime هشدار داد: اول `docker compose ps` و
  `docker compose logs --tail=100 web` را چک کنید (به `docs/ops.md` برای
  جزئیات نگاه کنید).

## اقدامات حادثه (Incident steps)

### سایت پایین است / ۵۰۲ مداوم

```bash
ssh -i ~/.ssh/founders_arena root@89.42.199.174
cd /srv/arena/app
docker compose ps
docker compose logs --tail=200 web
docker compose logs --tail=50 caddy
```

اگر `web` کرش کرده: `docker compose up -d web` (بدون rebuild، سریع). اگر
مشکل از یک دیپلوی اخیر است، به کامیت قبلی برگردید و دوباره `deploy.sh` را
اجرا کنید.

### دیتابیس خراب/ناسازگار شده

۱. بلافاصله سرویس‌دهی را متوقف نکنید مگر مطمئن شوید مشکل واقعاً دیتابیس
   است (نه یک باگ اپلیکیشن).
۲. جدیدترین بک‌آپ سالم را پیدا کنید (`ls -lt /srv/arena/backups | head`).
۳. ریستور کنید:
   ```bash
   deploy/restore.sh /srv/arena/backups/dev-<تازه‌ترین>.db.gz
   ```
   این اسکریپت خودش یک نسخهٔ ایمنی از وضعیت فعلی می‌گیرد، integrity check
   می‌کند، و فقط اگر سالم بود جایگزین می‌کند.
۴. بعد از ریستور، `curl http://89.42.199.174/api/phase` و چند صفحهٔ کلیدی
   (بازار، پنل ادمین) را دستی چک کنید.

### نیاز به شروع دوباره از صفر (بازنشانی کامل بازی)

فقط در شرایط اضطراری واقعی (مثلاً یک تست/rehearsal که باید کاملاً پاک شود
قبل از رویداد واقعی). **هرگز روی دیتابیس رویداد واقعی بدون هماهنگی کامل تیم
اجرا نکنید** — این عملیات غیرقابل بازگشت است مگر از بک‌آپ ریستور کنید.

```bash
# روی سرور، داخل کانتینر migrate/tools:
docker compose run --rm migrate npx tsx scripts/reset-game.ts --yes
# یا برای حفظ تیم‌های ثبت‌نام‌شده:
docker compose run --rm migrate npx tsx scripts/reset-game.ts --yes --keep-teams
```

قبل از این کار حتماً یک بک‌آپ دستی تازه بگیرید (بالا را ببینید) — اگر
اشتباهی رخ داد، تنها راه برگشت ریستور از همان بک‌آپ است.

### هشدار uptime دریافت شد ولی سایت از مرورگر خودتان بالاست

احتمالاً مشکل شبکهٔ مانیتور یا محل اجرای cron است، نه سرور. لاگ
`deploy/uptime-check.sh` را چک کنید و مطمئن شوید از سروری غیر از خودِ آرنا
اجرا می‌شود (طبق `docs/ops.md`، بخش ۴).
