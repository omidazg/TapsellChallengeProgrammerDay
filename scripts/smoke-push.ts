/**
 * دود-تست اعلان فوری (src/lib/push.ts + هوک آن در src/lib/notifications.ts).
 * اجرا: npx tsx scripts/smoke-push.ts
 *
 * مثل scripts/smoke-scheduler.ts، روی یک کپی از dev.db کار می‌کند تا پایگاه
 * دادهٔ اصلی دست‌نخورده بماند. فرستندهٔ web-push با __setPushSenderForTest
 * جایگزین می‌شود تا هیچ درخواست شبکهٔ واقعی‌ای ارسال نشود.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DB = path.join(ROOT, "dev.db");
const TMP_DB = path.join(os.tmpdir(), `arena-smoke-push-${process.pid}.db`);

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

function eq(label: string, actual: unknown, expected: unknown) {
  check(label, Object.is(actual, expected), { actual, expected });
}

async function main() {
  if (!fs.existsSync(SOURCE_DB)) {
    console.log("FAIL  dev.db پیدا نشد؛ ابتدا `npx prisma db push` را اجرا کنید.");
    process.exit(1);
  }
  fs.copyFileSync(SOURCE_DB, TMP_DB);
  process.env.DATABASE_URL = `file:${TMP_DB}`;

  // VAPID را قبل از import تنظیم می‌کنیم تا isPushConfigured() = true باشد.
  // این یک جفت کلید تست معتبر (فرمت صحیح، نه یک راز واقعی) است؛ web-push فرمت
  // کلید را (طول base64url) اعتبارسنجی می‌کند، پس مقدار دلخواه رد می‌شود.
  process.env.VAPID_PUBLIC_KEY = "BDpTjoWeo8oNUGnvDlkFsAv1i1kDiuuDYrZo36Rep51zgWfdnNApA-QhC-79Pec0jvf_v-B4P-7AJa317ZpGbxc";
  process.env.VAPID_PRIVATE_KEY = "dvnRBN4uxbTtJf_JdkRw6jITi-FmQc_i-u4ojuMBq80";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";

  const { prisma } = await import("../src/lib/db");
  const { notifyUser } = await import("../src/lib/notifications");
  const push = await import("../src/lib/push");

  try {
    // ---------- کاربر و دو اشتراک آزمایشی ----------
    const user = await prisma.user.create({
      data: {
        email: `smoke-push-${process.pid}@example.com`,
        passwordHash: "x",
        nickname: "تستر",
        role: "BUILDER",
        power: "HYPE",
      },
    });

    const okSub = await prisma.pushSubscription.create({
      data: { userId: user.id, endpoint: "https://push.example.com/ok", p256dh: "p256dh-ok", auth: "auth-ok" },
    });
    const goneSub = await prisma.pushSubscription.create({
      data: { userId: user.id, endpoint: "https://push.example.com/gone", p256dh: "p256dh-gone", auth: "auth-gone" },
    });

    // ---------- حالت ۱: notifyUser هنوز ردیف پایگاه‌داده می‌نویسد و push تلاش می‌شود ----------
    const sentCalls: { endpoint: string; payload: string }[] = [];
    push.__setPushSenderForTest(async (subscription, payload) => {
      sentCalls.push({ endpoint: subscription.endpoint, payload });
      if (subscription.endpoint === goneSub.endpoint) {
        const err = Object.assign(new Error("Gone"), { statusCode: 410 });
        throw err;
      }
      return { statusCode: 201 };
    });

    await notifyUser(user.id, { kind: "OUTBID", title: "پیشنهاد جدید", body: "کسی از تو پیشی گرفت", href: "/auction" });

    const rows = await prisma.notification.findMany({ where: { userId: user.id } });
    eq("notifyUser: ردیف اعلان در پایگاه‌داده ساخته شد", rows.length, 1);
    eq("notifyUser: عنوان درست ذخیره شد", rows[0]?.title, "پیشنهاد جدید");

    // ارسال push به‌صورت fire-and-forget است؛ کمی صبر می‌کنیم تا تسک‌های async کامل شوند.
    await new Promise((r) => setTimeout(r, 200));

    eq("push: به هر دو اشتراک تلاش برای ارسال شد", sentCalls.length, 2);
    const okCall = sentCalls.find((c) => c.endpoint === okSub.endpoint);
    check("push: payload شامل عنوان/متن/لینک/tag درست است", !!okCall, okCall);
    if (okCall) {
      const parsed = JSON.parse(okCall.payload);
      eq("push payload: title", parsed.title, "پیشنهاد جدید");
      eq("push payload: body", parsed.body, "کسی از تو پیشی گرفت");
      eq("push payload: href", parsed.href, "/auction");
      eq("push payload: tag = kind", parsed.tag, "OUTBID");
    }

    const remainingSubs = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
    eq("push: اشتراک 410 حذف شد", remainingSubs.some((s) => s.id === goneSub.id), false);
    eq("push: اشتراک موفق باقی ماند", remainingSubs.some((s) => s.id === okSub.id), true);

    // ---------- حالت ۲: بدون تنظیم VAPID، notifyUser نباید throw کند ----------
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    eq("push: بدون VAPID، isPushConfigured=false", push.isPushConfigured(), false);
    let threw = false;
    try {
      await notifyUser(user.id, { kind: "OUTBID", title: "بدون پیکربندی push" });
    } catch {
      threw = true;
    }
    eq("notifyUser بدون VAPID پرتاب خطا نمی‌کند", threw, false);
    const rows2 = await prisma.notification.findMany({ where: { userId: user.id } });
    eq("notifyUser بدون VAPID همچنان ردیف می‌نویسد", rows2.length, 2);
  } finally {
    push.__setPushSenderForTest(null);
    try {
      await prisma.$disconnect();
    } catch {
      /* پاکسازی بهترین‌تلاش */
    }
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      try {
        fs.rmSync(TMP_DB + suffix, { force: true });
      } catch {
        /* نادیده */
      }
    }
  }

  console.log("");
  console.log(`نتیجه: ${passed} PASS · ${failed} FAIL`);
  console.log(failed === 0 ? "SMOKE: PASS" : "SMOKE: FAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE: FAIL — خطای غیرمنتظره");
  console.error(e);
  process.exit(1);
});
