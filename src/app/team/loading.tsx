import { Container } from "@/components/ui";

// اتاق تیم: اعضا، دعوت‌ها و پیشرفت کارهای تیم خوانده می‌شود.
export default function Loading() {
  return (
    <Container className="pt-16">
      <div className="animate-pulse motion-reduce:animate-none space-y-4" aria-hidden>
        <div className="h-8 w-1/3 rounded-full bg-brand-mist" />
        <div className="h-4 w-2/3 rounded-full bg-brand-mist" />
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] mt-8">
          <div className="h-64 rounded-3xl bg-brand-mist" />
          <div className="h-64 rounded-3xl bg-brand-mist" />
        </div>
      </div>
      <span className="sr-only">در حال بارگذاری اتاق تیم…</span>
    </Container>
  );
}
