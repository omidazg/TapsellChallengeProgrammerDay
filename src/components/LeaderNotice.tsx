import Link from "next/link";
import { Alert } from "@/components/ui";

/** برای اعضایی که سرپرست نیستند: چرا فرم فقط‌خواندنی است و کجا رأی بدهند */
export function LeaderNotice({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <Alert kind="info">
      {reason}{" "}
      <Link href="/team" className="font-bold text-brand-cyan-dark underline">
        اتاق تیم و رأی‌گیری سرپرست
      </Link>
    </Alert>
  );
}
