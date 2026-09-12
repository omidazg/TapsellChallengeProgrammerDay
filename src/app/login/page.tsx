import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader, Container } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "ورود" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/team");

  return (
    <>
      <PageHeader eyebrow="ورود" title="برگرد به میدان" desc="با ایمیل و رمز عبوری که ساخته‌ای وارد شو." />
      <Container>
        <div className="mx-auto max-w-md">
          <LoginForm />
        </div>
      </Container>
    </>
  );
}
