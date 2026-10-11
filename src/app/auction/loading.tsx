import { Container } from "@/components/ui";

// حراج زنده: حراج جاری، صف و تاریخچهٔ پیشنهادها خوانده می‌شود.
export default function Loading() {
  return (
    <Container className="pt-16">
      <div className="animate-pulse motion-reduce:animate-none space-y-4" aria-hidden>
        <div className="h-8 w-1/3 rounded-full bg-brand-mist" />
        <div className="h-4 w-2/3 rounded-full bg-brand-mist" />
        <div className="h-72 rounded-3xl bg-brand-mist mt-8" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-48 rounded-3xl bg-brand-mist" />
          <div className="h-48 rounded-3xl bg-brand-mist" />
        </div>
      </div>
      <span className="sr-only">در حال بارگذاری حراج…</span>
    </Container>
  );
}
