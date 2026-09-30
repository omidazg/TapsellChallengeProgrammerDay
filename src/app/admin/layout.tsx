import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase, getSetting } from "@/lib/phase";
import { getSettledAt } from "@/lib/settlement";
import { AdminNav } from "./AdminNav";
import { AdminStatusBar } from "./AdminStatusBar";

/**
 * چارچوب مشترک همهٔ صفحه‌های پنل برگزارکننده: ناوبری ماندگار (کناری در دسکتاپ، تب‌بار در موبایل)
 * و نوار وضعیت زندهٔ بازی. هر صفحه و اکشن همچنان خودش requireAdmin() را صدا می‌زند.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [{ phase, endsAt }, autoAdvance, settledAt, pendingRequests] = await Promise.all([
    getPhase(),
    getSetting("auto_advance", "0"),
    getSettledAt(),
    prisma.accessRequest.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <div className="mx-auto max-w-7xl lg:flex lg:gap-2 lg:ps-4">
      <AdminNav badges={{ "/admin/whitelist": pendingRequests }} />
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
