import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildExportWorkbookBuffer } from "./workbook";

export const dynamic = "force-dynamic";

/** خروجی کامل اکسل برای پنل برگزارکننده. */
export async function GET() {
  await requireAdmin();
  const buffer = await buildExportWorkbookBuffer();

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");

  // exceljs بافر خودش را با یک اینترفیس Buffer سفارشی (بدون جنریک) تایپ کرده که با
  // Buffer<ArrayBufferLike> کتابخانهٔ Node (نسخهٔ جدید @types/node) یکی نیست؛ فقط در مرز عبور، cast می‌کنیم.
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="arena-export-${y}${m}${d}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
