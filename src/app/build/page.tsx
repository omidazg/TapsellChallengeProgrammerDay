import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty, Alert } from "@/components/ui";
import { ModuleClosed, ModuleReadOnly } from "@/components/ModuleState";
import { TrackSwitcher } from "@/components/TrackSwitcher";
import { TrackProgress } from "@/components/TrackProgress";
import { buildChecklist, parseImages, effectiveMaxPrice } from "@/lib/product";
import { teamAccess } from "@/lib/team-access";
import { LIVE_STATUS_LABEL, type LiveStatus } from "@/lib/studio";
import { moduleStatusFor, trackGate } from "@/lib/module-state";
import { resolveTrack } from "@/lib/track-data";
import { getBazaarSource } from "@/lib/bazaar";
import { BuildForm } from "./BuildForm";
import { ChecklistCard } from "./ChecklistCard";
import { StudioCard } from "./StudioCard";

export const metadata = { title: "مرکز ساخت" };

const TITLE = "مرکز ساخت";

export default async function BuildPage({ searchParams }: { searchParams: Promise<{ track?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const status = await moduleStatusFor("build", user.teamId);
  if (status === "hidden") notFound();
  if (status === "closed") return <ModuleClosed moduleKey="build" title={TITLE} />;

  if (!user.teamId || !user.team) {
    return (
      <>
        <PageHeader title={TITLE} desc="اینجا محصول تیمت را می‌سازی و تحویل می‌دهی." />
        <Container>
          <Empty
            title="هنوز عضو تیمی نیستی"
            desc="برای ساخت محصول، یک تیم بساز، به تیمی بپیوند یا «شرکت فردی» را انتخاب کن."
            cta={{ href: "/team", label: "رفتن به اتاق تیم" }}
          />
        </Container>
      </>
    );
  }

  const { track, tracks } = await resolveTrack(sp.track);
  if (!track) {
    return (
      <>
        <PageHeader title={TITLE} />
        <Container>
          <Empty title="فعلاً محوری باز نیست" desc="به‌محض باز شدن محورها می‌توانی محصولت را ثبت کنی." />
        </Container>
      </>
    );
  }

  const key = { teamId_trackId: { teamId: user.teamId, trackId: track.id } };
  const [product, idea, trackError, { canManage, reason }, maxPrice, bazaarSource, studioStatus, aiStatus, osIssues] = await Promise.all([
    prisma.product.findUnique({ where: key }),
    prisma.idea.findUnique({ where: key, select: { submittedAt: true } }),
    trackGate(track.id, user.teamId),
    teamAccess(user),
    effectiveMaxPrice(),
    getBazaarSource(),
    moduleStatusFor("studio", user.teamId),
    moduleStatusFor("ai", user.teamId),
    track.kind === "OS"
      ? prisma.osIssue.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, title: true, url: true } })
      : Promise.resolve([]),
  ]);

  const ideaSubmitted = !!idea?.submittedAt;
  const nav = (
    <>
      <TrackSwitcher tracks={tracks} current={track.id} hrefFor={(id) => `/build?track=${encodeURIComponent(id ?? track.id)}`} />
      <TrackProgress
        trackId={track.id}
        hasTeam
        ideaSubmitted={ideaSubmitted}
        productSubmitted={!!product?.submittedAt}
        publish={track.kind === "PRODUCT" ? { requested: !!product?.liveStatus } : null}
      />
      {status === "ro" && <ModuleReadOnly moduleKey="build" />}
      {trackError && <Alert kind="info">{trackError}</Alert>}
      {reason && <Alert kind="info">{reason}</Alert>}
    </>
  );

  // ترتیب داخلی تیم: محصول هر محور فقط پس از ثبت نهایی ایدهٔ همان محور (اکشن هم همین را چک می‌کند)
  if (!ideaSubmitted && !product) {
    return (
      <>
        <PageHeader eyebrow={track.name} title={TITLE} desc="هر تیم مراحلش را به ترتیب طی می‌کند: اول ایده، بعد محصول." />
        <Container className="max-w-3xl space-y-6">
          {nav}
          <Empty
            title="اول ایده‌ات را در همین محور ثبت نهایی کن"
            desc={`مرکز ساخت محور «${track.name}» پس از ثبت نهایی ایده برای تیمت باز می‌شود.`}
            cta={{ href: `/idea?track=${encodeURIComponent(track.id)}`, label: "رفتن به ثبت ایده" }}
          />
        </Container>
      </>
    );
  }

  // هر عضو تیم (یا شرکت‌کنندهٔ فردی) محصول را مدیریت می‌کند.
  const editable = status === "open" && !trackError && ideaSubmitted && canManage;
  const lockNote = !ideaSubmitted
    ? "ایدهٔ این محور برای ویرایش باز شده است؛ برای ادامهٔ ساخت، اول دوباره آن را ثبت نهایی کن."
    : status !== "open" || trackError
      ? null
      : undefined;

  const checklist = buildChecklist(
    {
      trackKind: track.kind,
      trackCategory: track.category,
      category: product?.category ?? "",
      deliverableUrl: product?.deliverableUrl ?? "",
      name: product?.name ?? "",
      tagline: product?.tagline ?? "",
      description: product?.description ?? "",
      demoUrl: product?.demoUrl ?? "",
      teaserUrl: product?.teaserUrl ?? "",
      images: product?.images ?? "[]",
      price: product?.price ?? 20,
      specialName: product?.specialName ?? "",
      submittedAt: product?.submittedAt ?? null,
    },
    maxPrice
  );

  // بازار استودیو فقط برای محور ساخت محصول و وقتی منبع آمار خاموش نیست
  const showStudio = track.kind === "PRODUCT" && bazaarSource !== "off" && studioStatus !== "hidden";
  const liveStatus = (product?.liveStatus ?? "") as LiveStatus;
  const studioOpen = studioStatus === "open" && !!product?.submittedAt;
  const studioClosedNote = !product?.submittedAt ? "اول محصولت را ثبت نهایی کن، بعد درخواست انتشار بده." : studioOpen ? null : "درخواست انتشار فعلاً باز نیست.";

  return (
    <>
      <PageHeader
        eyebrow={track.name}
        title={TITLE}
        desc={
          editable
            ? "محصولت را کامل کن و ثبت نهایی کن. بعد از ثبت، بازخورد هوش مصنوعی می‌آید و هر عضو تیم می‌تواند برای ویرایش دوباره آن را باز کند."
            : "این صفحه الان قابل ویرایش نیست؛ فقط می‌توانی وضعیت محصول را ببینی."
        }
      />
      <Container className="space-y-4 mb-6">{nav}</Container>
      <Container className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
        <div className="order-2 lg:order-1">
          <ChecklistCard
            checklist={checklist}
            submitted={!!product?.submittedAt}
            slug={product?.slug ?? null}
            editable={editable}
            trackId={track.id}
            aiQuality={product?.aiFinal ?? product?.aiQuality ?? null}
            aiNotes={product?.aiFinalNotes ?? product?.aiNotes ?? null}
            canRecheck={!!product?.submittedAt && !product.aiRecheckUsed && canManage && aiStatus === "open"}
          />
        </div>
        <div className="order-1 lg:order-2 space-y-6">
          <BuildForm
            key={track.id}
            trackId={track.id}
            trackKind={track.kind}
            trackCategory={track.category}
            osIssues={osIssues}
            draftKey={`${user.teamId}:${track.id}:${product?.id ?? "new"}`}
            editable={editable}
            lockNote={lockNote}
            submitted={!!product?.submittedAt}
            maxPrice={maxPrice}
            initial={
              product
                ? {
                    name: product.name,
                    tagline: product.tagline,
                    description: product.description,
                    demoUrl: product.demoUrl,
                    teaserUrl: product.teaserUrl,
                    images: parseImages(product.images),
                    price: product.price,
                    specialName: product.specialName,
                    specialDesc: product.specialDesc,
                    specialStart: product.specialStart,
                    category: product.category,
                    deliverableUrl: product.deliverableUrl,
                    contentType: product.contentType,
                    osIssueId: product.osIssueId ?? "",
                    preExistingNote: product.preExistingNote,
                  }
                : null
            }
          />
          {showStudio && (
            <StudioCard
              key={`studio-${track.id}`}
              trackId={track.id}
              status={liveStatus}
              statusLabel={liveStatus ? LIVE_STATUS_LABEL[liveStatus] : ""}
              sourceUrl={product?.liveSourceUrl ?? ""}
              requestNote={product?.liveRequestNote ?? ""}
              liveUrl={product?.liveUrl ?? ""}
              adminNote={product?.liveAdminNote ?? ""}
              bazaarPackage={product?.bazaarPackage ?? ""}
              canManage={canManage}
              open={studioOpen}
              closedNote={studioClosedNote}
            />
          )}
        </div>
      </Container>
    </>
  );
}
