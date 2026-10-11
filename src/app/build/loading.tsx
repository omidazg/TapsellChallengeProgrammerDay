import { Container } from "@/components/ui";

// مرکز ساخت: محصول تیم و چک‌لیست ثبت نهایی خوانده می‌شود.
export default function Loading() {
  return (
    <Container className="pt-16">
      <div className="animate-pulse motion-reduce:animate-none space-y-4" aria-hidden>
        <div className="h-8 w-1/3 rounded-full bg-brand-mist" />
        <div className="h-4 w-2/3 rounded-full bg-brand-mist" />
        <div className="grid gap-6 lg:grid-cols-[320px_1fr] mt-8 items-start">
          <div className="h-56 rounded-3xl bg-brand-mist" />
          <div className="h-96 rounded-3xl bg-brand-mist" />
        </div>
      </div>
      <span className="sr-only">در حال بارگذاری مرکز ساخت…</span>
    </Container>
  );
}
