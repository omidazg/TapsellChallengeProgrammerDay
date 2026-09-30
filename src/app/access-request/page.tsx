import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPhase } from "@/lib/phase";
import { PageHeader, Container, Alert } from "@/components/ui";
import { AccessRequestForm } from "./AccessRequestForm";

export const metadata = { title: "درخواست دسترسی" };

export default async function AccessRequestPage({ searchParams }: { searchParams: Promise<{ email?: string; phone?: string }> }) {
  const { email, phone } = await searchParams;
  if (await getCurrentUser()) redirect("/team");
  const { phase } = await getPhase();

  return (
    <>
      <PageHeader
        eyebrow="درخواست دسترسی"
        title="هنوز در لیست سفید نیستی؟"
        desc="مشخصاتت را بفرست؛ برگزارکننده درخواستت را بررسی می‌کند و بعد از تأیید می‌توانی ثبت‌نام کنی."
      />
      <Container>
        <div className="mx-auto max-w-md space-y-4">
          {phase !== "REGISTRATION" && (
            <Alert kind="info">فاز ثبت‌نام الان بسته است؛ درخواستت ثبت می‌شود ولی حتی پس از تأیید، ساخت حساب فقط وقتی ممکن است که برگزارکننده ثبت‌نام را دوباره باز کند.</Alert>
          )}
          <AccessRequestForm
            email={typeof email === "string" ? email.slice(0, 120) : ""}
            phone={typeof phone === "string" ? phone.slice(0, 20) : ""}
          />
        </div>
      </Container>
    </>
  );
}
