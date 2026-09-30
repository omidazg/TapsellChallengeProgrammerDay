import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader, Container } from "@/components/ui";
import { LoginForm } from "./LoginForm";
import { safeNext } from "./next";
import { smsEnabled } from "@/lib/sms";

export const metadata = { title: "ورود" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(safeNext(next) ?? "/team");

  return (
    <>
      <PageHeader eyebrow="ورود" title="برگرد به میدان" desc={smsEnabled() ? "با ایمیل و رمز، یا با شمارهٔ موبایل و کد پیامکی وارد شو." : "با ایمیل و رمز عبوری که ساخته‌ای وارد شو."} />
      <Container>
        <div className="mx-auto max-w-md">
          <LoginForm next={safeNext(next)} smsEnabled={smsEnabled()} />
        </div>
      </Container>
    </>
  );
}
