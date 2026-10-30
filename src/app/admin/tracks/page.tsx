import { requireAdmin } from "@/lib/auth";
import { listAllTracks } from "@/lib/track-data";
import { PageHeader, Container, Empty } from "@/components/ui";
import { TrackForm } from "./TrackForm";

export const metadata = { title: "محورها و وزن‌ها · پنل برگزارکننده" };

export default async function AdminTracksPage() {
  await requireAdmin();
  const tracks = await listAllTracks();
  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="محورها و وزن‌ها"
        desc="مشخصات هر محور، سهم هوش مصنوعی، بازار و داوری از امتیاز، و معیارهای داوری آن."
      />
      <Container className="space-y-6">
        {tracks.length === 0 ? <Empty title="محوری تعریف نشده است" /> : tracks.map((t) => <TrackForm key={t.id} track={t} />)}
      </Container>
    </>
  );
}
