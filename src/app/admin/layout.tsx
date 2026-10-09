import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase, getSetting } from "@/lib/phase";
import { getSettledAt } from "@/lib/settlement";
import { getPaymentDriver } from "@/lib/coins";
import { AdminNav } from "./AdminNav";
import { AdminStatusBar } from "./AdminStatusBar";

/**
 * چارچوب مشترک همهٔ صفحه‌های پنل برگزارکننده: ناوبری ماندگار (کناری در دسکتاپ، تب‌بار در موبایل)
 * و نوار وضعیت زندهٔ بازی. هر صفحه و اکشن همچنان خودش requireAdmin() را صدا می‌زند.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  // سفارش‌های در انتظارِ سکه فقط با پرداخت دستی منتظر اقدام برگزارکننده‌اند؛ با درگاه، PENDING یعنی پرداخت نیمه‌کاره.
  const manualPayments = !getPaymentDriver().online;
  const [{ phase, endsAt }, autoAdvance, settledAt, pendingRequests, pendingOrders, studioRequests] = await Promise.all([
    getPhase(),
    getSetting("auto_advance", "0"),
    getSettledAt(),
    prisma.accessRequest.count({ where: { status: "PENDING" } }),
    manualPayments ? prisma.coinOrder.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
    prisma.product.count({ where: { liveStatus: "REQUESTED" } }),
  ]);

  return (
    <div className="mx-auto max-w-7xl lg:flex lg:gap-2 lg:ps-4">
      <AdminNav
        badges={{ "/admin/whitelist": pendingRequests, "/admin/coins": pendingOrders, "/admin/studio": studioRequests }}
      />
      <div className="flex-1 min-w-0">
        <div className="px-4 sm:px-6 pt-4 sm:pt-6">
          <AdminStatusBar
            phase={phase}
            endsAt={endsAt ? endsAt.toISOString() : null}
            autoAdvance={autoAdvance === "1"}
            settledAt={settledAt ? settledAt.toISOString() : null}
          />
        </div>
        {children}
      </div>
    </div>
  );
}
