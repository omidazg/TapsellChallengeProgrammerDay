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

**نکتهٔ مهم:** پیش از اولین اجرا، حتماً فایل `/srv/arena/app/.env` را روی سرور ویرایش کنید و مقادیر واقعی (`SESSION_SECRET`، `ADMIN_PASSWORD`، `ANTHROPIC_API_KEY` و در صورت نیاز `SITE_ADDRESS`) را قرار دهید:

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
