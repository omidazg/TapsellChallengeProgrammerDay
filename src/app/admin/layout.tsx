import { requirePanelUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase } from "@/lib/phase";
import { getSettledAt } from "@/lib/settlement";
import { getPaymentDriver } from "@/lib/coins";
import { AdminNav } from "./AdminNav";
import { AdminStatusBar } from "./AdminStatusBar";

/**
 * چارچوب مشترک همهٔ صفحه‌های پنل: ناوبری ماندگار (کناری در دسکتاپ، تب‌بار در موبایل) و نوار وضعیت زندهٔ مسابقه.
 * داور و اپراتور بازار استودیو هم وارد این چارچوب می‌شوند ولی فقط پیوندهای خودشان را می‌بینند؛
 * هر صفحه و اکشن همچنان خودش نگهبان نقش (requireAdmin / requireJudge / requireStudioOp) را صدا می‌زند.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requirePanelUser();

  if (role !== "ADMIN") {
    const studioRequests = role === "STUDIO_OP" ? await prisma.product.count({ where: { liveStatus: "REQUESTED" } }) : 0;
    return (
      <div className="mx-auto max-w-7xl lg:flex lg:gap-2 lg:ps-4">
        <AdminNav role={role} badges={{ "/admin/studio": studioRequests }} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    );
  }

  // سفارش‌های در انتظارِ سکه فقط با پرداخت دستی منتظر اقدام برگزارکننده‌اند؛ با درگاه، PENDING یعنی پرداخت نیمه‌کاره.
  const manualPayments = !getPaymentDriver().online;
  const [{ phase, endsAt }, settledAt, pendingRequests, pendingOrders, studioRequests] = await Promise.all([
    getPhase(),
    getSettledAt(),
    prisma.accessRequest.count({ where: { status: "PENDING" } }),
    manualPayments ? prisma.coinOrder.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
    prisma.product.count({ where: { liveStatus: "REQUESTED" } }),
  ]);

  return (
    <div className="mx-auto max-w-7xl lg:flex lg:gap-2 lg:ps-4">
      <AdminNav
        role={role}
        badges={{ "/admin/whitelist": pendingRequests, "/admin/coins": pendingOrders, "/admin/studio": studioRequests }}
      />
      <div className="flex-1 min-w-0">
        <div className="px-4 sm:px-6 pt-4 sm:pt-6">
          <AdminStatusBar
            phase={phase}
            endsAt={endsAt ? endsAt.toISOString() : null}
            settledAt={settledAt ? settledAt.toISOString() : null}
          />
        </div>
        {children}
      </div>
    </div>
  );
}
