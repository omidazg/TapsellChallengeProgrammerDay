import Link from "next/link";
import { Container } from "@/components/ui";

export const metadata = { title: "پیدا نشد" };

// صفحهٔ ۴۰۴ سراسری: وقتی مسیر درخواستی وجود ندارد یا notFound() فراخوانی شود.
export default function NotFound() {
  return (
    <Container className="pt-16">
      <div className="mx-auto max-w-xl text-center anim-pop">
        <div className="text-6xl mb-4" aria-hidden>
          🧭
        </div>
        <h1 className="text-2xl font-black text-brand-navy mb-2">این صفحه پیدا نشد</h1>
        <p className="text-brand-slate mb-8">
          آدرسی که دنبالش بودید یا اشتباه است یا دیگر وجود ندارد. از اینجا می‌توانید به خانه برگردید یا راهنمای بازی را ببینید.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary">
            بازگشت به خانه
          </Link>
          <Link href="/guide" className="btn-ghost">
            راهنمای بازی
          </Link>
        </div>
      </div>
    </Container>
  );
}
