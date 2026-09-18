import Link from "next/link";

export const metadata = { title: "بدون اتصال" };

// صفحهٔ آفلاین: کاملاً استاتیک، بدون تماس با دیتابیس یا احراز هویت، تا service
// worker بتواند آن را پیش‌کش (precache) و در نبود اینترنت نمایش دهد.
export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <div className="text-6xl mb-4" aria-hidden>
        📡
      </div>
      <h1 className="text-2xl font-black text-brand-navy mb-2">اتصال اینترنت برقرار نیست</h1>
      <p className="text-brand-slate mb-8">
        به‌نظر می‌رسد اتصال شما قطع شده. وقتی دوباره به اینترنت وصل شدید، این صفحه را ببندید و به میدان بنیان‌گذاران برگردید.
      </p>
      <Link href="/" className="btn-primary">
        تلاش دوباره
      </Link>
    </div>
  );
}
