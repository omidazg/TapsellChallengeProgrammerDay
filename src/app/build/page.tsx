import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getPhase, phaseIndex, PHASE_LABEL } from "@/lib/phase";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty, Locked, Alert } from "@/components/ui";
import { buildChecklist, parseImages, effectiveMaxPrice } from "@/lib/product";
import { teamAccess } from "@/lib/team-access";
import { LIVE_STATUS_LABEL, type LiveStatus } from "@/lib/studio";
import { PRIZES } from "@/lib/prizes";
import { BuildForm } from "./BuildForm";
import { ChecklistCard } from "./ChecklistCard";
import { StudioCard } from "./StudioCard";

export const metadata = { title: "مرکز ساخت" };

export default async function BuildPage() {
  const user = await requireUser();
  const { phase } = await getPhase();

  if (!user.teamId || !user.team) {
    return (
      <>
        <PageHeader eyebrow="فاز فعلی" title="مرکز ساخت" desc="اینجا محصول تیمت را می‌سازی: توضیح، تیزر، تصاویر، قیمت و نسخهٔ ویژه." />
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

  if (phaseIndex(phase) < phaseIndex("IDEATION")) {
    return (
      <>
        <PageHeader
          eyebrow={`از فاز «${PHASE_LABEL.IDEATION}» باز می‌شود`}
          title="مرکز ساخت"
          action={
            <Link href="/" className="btn-ghost">
              الان چه کنم؟
            </Link>
          }
        />
        <Container>
          <Locked title="هنوز زود است" desc="مرکز ساخت از فاز «اتاق ایده» باز می‌شود." />
        </Container>
      </>
    );
  }

  const product = await prisma.product.findUnique({ where: { teamId: user.teamId } });
  const phaseEditable = phaseIndex(phase) < phaseIndex("MARKET");
  // هر عضو تیم (یا شرکت‌کنندهٔ فردی) محصول را مدیریت می‌کند.
  const { canManage, reason } = await teamAccess(user);
  const editable = phaseEditable && canManage;
  const maxPrice = await effectiveMaxPrice();

  const checklistInput = {
    name: product?.name ?? "",
    tagline: product?.tagline ?? "",
    description: product?.description ?? "",
    demoUrl: product?.demoUrl ?? "",
    teaserUrl: product?.teaserUrl ?? "",
    images: product?.images ?? "[]",
    price: product?.price ?? 20,
    specialName: product?.specialName ?? "",
    submittedAt: product?.submittedAt ?? null,
  };
  const checklist = buildChecklist(checklistInput, maxPrice);

  // بازار استودیو: درخواست انتشار در «ساخت محصول» و «روز بازار»
  const liveStatus = (product?.liveStatus ?? "") as LiveStatus;
  const studioOpen = (phase === "BUILD" || phase === "MARKET") && !!product;
  const studioClosedNote = !product
    ? "اول پیش‌نویس محصول را ذخیره کن."
    : phaseIndex(phase) < phaseIndex("BUILD")
      ? `درخواست انتشار از فاز «${PHASE_LABEL.BUILD}» باز می‌شود.`
      : phase === "CLOSED"
        ? "بازی تمام شده است."
        : null;
  const livePrize = PRIZES.find((p) => p.key === "live");

  return (
    <>
      <PageHeader
        eyebrow="فاز فعلی"
        title="مرکز ساخت"
        desc={
          editable
            ? "محصولت را کامل کن و پیش از پایان فاز ساخت، ثبت نهایی کن. هر عضو تیم می‌تواند ویرایشش کند."
            : "مرکز ساخت قفل شده است؛ فقط می‌توانی پیش‌نمایش را ببینی."
        }
      />
      {phaseEditable && reason && (
        <Container className="mb-4">
          <Alert kind="info">{reason}</Alert>
        </Container>
      )}
      <Container className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
        <div className="order-2 lg:order-1">
          <ChecklistCard
            checklist={checklist}
            submitted={!!product?.submittedAt}
            slug={user.team.slug}
            editable={editable}
            aiQuality={product?.aiQuality ?? null}
            aiNotes={product?.aiNotes ?? null}
          />
        </div>
        <div className="order-1 lg:order-2 space-y-6">
          <BuildForm
            draftKey={`${user.teamId}:${product?.id ?? "new"}`}
            editable={editable}
            lockNote={phaseEditable ? null : undefined}
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
                  }
                : null
            }
          />
          <StudioCard
            status={liveStatus}
            statusLabel={liveStatus ? LIVE_STATUS_LABEL[liveStatus] : ""}
            sourceUrl={product?.liveSourceUrl ?? ""}
            requestNote={product?.liveRequestNote ?? ""}
            liveUrl={product?.liveUrl ?? ""}
            adminNote={product?.liveAdminNote ?? ""}
            canManage={canManage}
            open={studioOpen}
            closedNote={studioClosedNote}
            prizeLabel={livePrize?.label ?? "بهترین محصول لایو"}
          />
        </div>
      </Container>
    </>
  );
}
