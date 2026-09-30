"use client";

/**
 * بارگذاری دوبارهٔ همین صفحه (نه رفتن به خانه)، تا کاربر به همان جایی که بود برگردد.
 * href="" همان آدرس فعلی است؛ اگر این صفحه آفلاین و بدون JS هیدریت نشده باشد، لینک ساده همان کار را می‌کند.
 */
export function RetryButton() {
  return (
    <a
      href=""
      onClick={(e) => {
        e.preventDefault();
        window.location.reload();
      }}
      className="btn-primary"
    >
      تلاش دوباره
    </a>
  );
}
