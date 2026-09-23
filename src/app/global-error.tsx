"use client";

/**
 * مرز خطای سراسری: وقتی خطا در خودِ layout ریشه رخ دهد فعال می‌شود، پس globals.css/theme.css
 * و فونت بارگذاری‌شده در layout در دسترس نیستند (طبق مستندات نکست‌جی‌اس). به همین دلیل
 * <html>/<body> خودش را می‌سازد و فقط از استایل inline استفاده می‌کند.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="fa" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#002d47",
          color: "#eaf4fa",
          fontFamily: "Tahoma, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }} role="alert">
          <div style={{ fontSize: 56, marginBottom: 16 }} aria-hidden>
            ⚠️
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 8px" }}>خطای جدی در برنامه</h1>
          <p style={{ color: "#9fb8c9", margin: "0 0 24px" }}>
            متأسفانه اجرای صفحه با مشکل مواجه شد. لطفاً دوباره تلاش کنید.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              display: "inline-block",
              background: "#e10126",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "12px 24px",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            تلاش دوباره
          </button>
          {error.digest && (
            <p style={{ marginTop: 24, fontSize: 11, color: "#6f8fa1" }} dir="ltr">
              کد خطا برای پشتیبانی: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
