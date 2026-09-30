import { getActiveAnnouncements } from "@/lib/notifications";

// متن سفید روی brand-cyan (~۲٫۴:۱) و amber-500 (~۲:۱) خوانا نبود؛ این ترکیب‌ها ≥۴٫۵:۱ هستند
const LEVEL_CLASS: Record<string, string> = {
  info: "bg-brand-cyan-dark text-white",
  warning: "bg-amber-400 text-[#002d47]", // رنگ ثابت (نه text-brand-navy که در حالت تیره روشن می‌شود)
  danger: "bg-brand-red text-white",
};

/**
 * نوار اطلاعیه‌های فعال. کامپوننت سرور است (بدون "use client") چون مستقیماً از دیتابیس
 * می‌خواند؛ قابلیت بستن (و به‌خاطرسپاری در localStorage) با یک اسکریپت ساده‌ی وانیلا
 * در همین فایل پیاده‌سازی شده تا نیازی به کامپوننت کلاینت جدا نباشد.
 */
export async function AnnouncementBar() {
  const announcements = await getActiveAnnouncements().catch(() => []);
  if (announcements.length === 0) return null;

  return (
    <div id="announcement-bar-root">
      {announcements.map((a) => (
        <div
          key={a.id}
          id={`announcement-${a.id}`}
          className={`announcement-item flex items-center gap-3 px-4 py-2 text-sm font-bold ${LEVEL_CLASS[a.level] ?? LEVEL_CLASS.info}`}
          data-announcement-id={a.id}
        >
          <span className="flex-1 break-words">{a.text}</span>
          <button
            type="button"
            className="announcement-dismiss shrink-0 -my-1 inline-flex size-8 items-center justify-center rounded-full text-base leading-none opacity-80 hover:opacity-100"
            data-dismiss-id={a.id}
            aria-label="بستن اطلاعیه"
          >
            ✕
          </button>
        </div>
      ))}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              var KEY = "arena_dismissed_announcements";
              function dismissed() {
                try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
              }
              var list = dismissed();
              list.forEach(function (id) {
                var el = document.getElementById("announcement-" + id);
                if (el) el.style.display = "none";
              });
              // event delegation: این اسکریپت فقط یک‌بار (بارگذاری اول) اجرا می‌شود؛ اطلاعیه‌هایی که
              // بعداً با router.refresh اضافه می‌شوند هم باید دکمهٔ بستن کارا داشته باشند.
              if (window.__arenaAnnDismiss) return;
              window.__arenaAnnDismiss = true;
              document.addEventListener("click", function (e) {
                var btn = e.target && e.target.closest ? e.target.closest(".announcement-dismiss") : null;
                if (!btn) return;
                var id = btn.getAttribute("data-dismiss-id");
                var el = document.getElementById("announcement-" + id);
                if (el) el.style.display = "none";
                var cur = dismissed();
                if (id && cur.indexOf(id) === -1) {
                  cur.push(id);
                  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e2) {}
                }
              });
            })();
          `,
        }}
      />
    </div>
  );
}
