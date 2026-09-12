import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPhase } from "@/lib/phase";
import { PageHeader, Container, Locked } from "@/components/ui";
import { RegisterWizard } from "./RegisterWizard";

export const metadata = { title: "خودت را کد بزن" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/team");

  const { phase } = await getPhase();
  if (phase !== "REGISTRATION") {
    return (
      <>
        <PageHeader eyebrow="ثبت‌نام" title="خودت را کد بزن" desc="شخصیت بازی‌ات را بساز و وارد میدان شو." />
        <Container>
          <Locked title="ثبت‌نام بسته است" desc="فاز ثبت‌نام به پایان رسیده؛ دیگر امکان ساخت شخصیت جدید نیست." />
        </Container>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="ثبت‌نام" title="خودت را کد بزن" desc="شخصیت بازی‌ات را بساز، نقش و قدرتت را انتخاب کن و وارد میدان شو." />
      <Container>
        <RegisterWizard />
      </Container>
    </>
  );
}
