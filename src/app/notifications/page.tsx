import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listNotifications, type NotificationItem } from "@/lib/notifications";
import { PageHeader, Container, Empty } from "@/components/ui";
import { jdatetime } from "@/lib/persian";
import { PushToggle } from "@/components/PushToggle";

export const metadata = { title: "اعلان‌ها" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id, 200);

  return (
    <>
      <PageHeader eyebrow="اعلان‌ها" title="همهٔ اعلان‌ها" desc="تاریخچهٔ کامل اعلان‌های تو در بازی." />
      <Container className="space-y-3">
        <PushToggle />
        {items.length === 0 ? (
          <Empty title="اعلانی نداری" desc="وقتی فاز بازی عوض شود یا رویدادی برایت رخ دهد، اینجا نشان داده می‌شود." />
        ) : (
          <div className="space-y-2 stagger">
            {items.map((n) => (
              <NotificationRow key={n.id} notification={n} />
            ))}
          </div>
        )}
      </Container>
    </>
  );
}

function NotificationRow({ notification }: { notification: NotificationItem }) {
  const content = (
    <div className={`card p-4 sm:p-5 ${!notification.readAt ? "bg-brand-ice/60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="font-bold text-brand-navy break-words">{notification.title}</div>
        {!notification.readAt && <span className="chip-red shrink-0">جدید</span>}
      </div>
      {notification.body && <p className="mt-1 text-sm text-brand-slate break-words">{notification.body}</p>}
      <div className="mt-2 text-xs text-brand-slate">{jdatetime(new Date(notification.createdAt))}</div>
    </div>
  );
  return notification.href ? (
    <Link href={notification.href} className="block hover:shadow-lift transition rounded-3xl">
      {content}
    </Link>
  ) : (
    content
  );
}
