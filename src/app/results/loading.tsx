import { Container } from "@/components/ui";

// نتایج: محاسبهٔ امتیازها (computeScoresCached) و تسویه می‌تواند سنگین باشد.
export default function Loading() {
  return (
    <Container className="pt-16">
      <div className="animate-pulse motion-reduce:animate-none space-y-4" aria-hidden>
        <div className="h-8 w-1/3 rounded-full bg-brand-mist" />
        <div className="space-y-3 mt-8">
          <div className="h-16 rounded-2xl bg-brand-mist" />
          <div className="h-16 rounded-2xl bg-brand-mist" />
          <div className="h-16 rounded-2xl bg-brand-mist" />
        </div>
      </div>
      <span className="sr-only">در حال بارگذاری نتایج…</span>
    </Container>
  );
}
