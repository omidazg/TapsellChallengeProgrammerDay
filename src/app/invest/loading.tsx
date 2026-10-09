import { Container } from "@/components/ui";

// دور حمایت: فهرست ایده‌ها به‌همراه مجموع حمایت‌ها خوانده می‌شود.
export default function Loading() {
  return (
    <Container className="pt-16">
      <div className="animate-pulse motion-reduce:animate-none space-y-4" aria-hidden>
        <div className="h-8 w-1/3 rounded-full bg-brand-mist" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-8">
          <div className="h-40 rounded-3xl bg-brand-mist" />
          <div className="h-40 rounded-3xl bg-brand-mist" />
          <div className="h-40 rounded-3xl bg-brand-mist" />
        </div>
      </div>
      <span className="sr-only">در حال بارگذاری ایده‌ها…</span>
    </Container>
  );
}
