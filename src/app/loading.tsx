import { Container } from "@/components/ui";

/**
 * اسکلت بارگذاری سبک برای مرز Suspense ریشه. عمداً ساده نگه داشته شده (چند بلوک خاکستری)
 * چون بیشتر صفحات دادهٔ خودشان را سریع می‌خوانند؛ صفحات سنگین‌تر loading.tsx مخصوص خود را دارند.
 */
export default function Loading() {
  return (
    <Container className="pt-16">
      <div className="animate-pulse motion-reduce:animate-none space-y-4" aria-hidden>
        <div className="h-8 w-1/3 rounded-full bg-brand-mist" />
        <div className="h-4 w-2/3 rounded-full bg-brand-mist" />
        <div className="grid gap-4 sm:grid-cols-2 mt-8">
          <div className="h-24 rounded-3xl bg-brand-mist" />
          <div className="h-24 rounded-3xl bg-brand-mist" />
        </div>
      </div>
      <span className="sr-only">در حال بارگذاری…</span>
    </Container>
  );
}
