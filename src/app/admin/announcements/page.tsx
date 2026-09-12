import { requireAdmin } from "@/lib/auth";
import { listAnnouncements } from "@/lib/notifications";
import { PageHeader, Container, Empty } from "@/components/ui";
import { AnnouncementForm } from "./AnnouncementForm";
import { AnnouncementRow } from "./AnnouncementRow";

export const metadata = { title: "اطلاعیه‌ها · پنل برگزارکننده" };
export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  await requireAdmin();
  const announcements = await listAnnouncements();

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="اطلاعیه‌ها" desc="نوار اطلاعیهٔ فعال در بالای همهٔ صفحات برای همه نمایش داده می‌شود." />
      <Container className="space-y-6">
        <AnnouncementForm />

        {announcements.length === 0 ? (
          <Empty title="اطلاعیه‌ای ثبت نشده" />
        ) : (
          <div className="space-y-3 stagger">
            {announcements.map((a) => (
              <AnnouncementRow key={a.id} announcement={a} />
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
