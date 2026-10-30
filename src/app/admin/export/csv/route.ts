import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LEDGER_REASON_LABEL, WALLET_LABEL } from "@/lib/scoring";
import { ENTRY_COLUMNS, loadEntryRows } from "../entries";

// BOM تا اکسل فارسی فایل را UTF-8 بخواند
const BOM = "﻿";

export const dynamic = "force-dynamic";

const COIN_ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "در انتظار پرداخت",
  PAID: "پرداخت‌شده",
  FAILED: "ناموفق / ردشده",
  CANCELED: "لغو کاربر",
};

function csvCell(v: string | number): string {
  let s = String(v);
  // جلوگیری از تزریق فرمول (CSV injection): نام تیم/نام مستعار را کاربر می‌نویسد و اکسل
  // سلول متنیِ شروع‌شده با = + - @ (یا تب/CR) را فرمول اجرا می‌کند. عددها (مثل تغییر منفی) دست نمی‌خورند.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: (string | number)[][]): string {
  return BOM + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function csvResponse(body: string, filename: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** خروجی CSV امتیاز ثبت‌ها، دفتر کل کامل یا سفارش‌های سکه، برای پنل برگزارکننده. */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const type = req.nextUrl.searchParams.get("type") ?? "teams";

  if (type === "ledger") {
    const entries = await prisma.ledgerEntry.findMany({
      include: { user: { select: { nickname: true } } },
      orderBy: { createdAt: "asc" },
    });
    const teams = await prisma.team.findMany({ select: { id: true, name: true } });
    const teamNames = new Map(teams.map((t) => [t.id, t.name]));

    const rows: (string | number)[][] = [
      ["شناسه", "کاربر", "تیم", "کیف", "تغییر", "دلیل", "مرجع", "زمان"],
      ...entries.map((e) => [
        e.id,
        e.user?.nickname ?? "",
        e.teamId ? teamNames.get(e.teamId) ?? e.teamId : "",
        WALLET_LABEL[e.wallet] ?? e.wallet,
        e.delta,
        LEDGER_REASON_LABEL[e.reason] ?? e.reason,
        e.refId ?? "",
        e.createdAt.toISOString(),
      ]),
    ];
    return csvResponse(toCsv(rows), "ledger.csv");
  }

  if (type === "coins") {
    const orders = await prisma.coinOrder.findMany({
      include: { user: { select: { nickname: true } } },
      orderBy: { createdAt: "asc" },
    });
    const rows: (string | number)[][] = [
      ["شناسه", "کاربر", "سکه", "مبلغ (تومان)", "وضعیت", "درگاه", "کد پیگیری", "یادداشت", "زمان ثبت", "زمان پرداخت"],
      ...orders.map((o) => [
        o.id,
        o.user?.nickname ?? "",
        o.coins,
        Math.round(o.amountRial / 10),
        COIN_ORDER_STATUS_LABEL[o.status] ?? o.status,
        o.gateway,
        o.refId ?? "",
        o.note,
        o.createdAt.toISOString(),
        o.paidAt?.toISOString() ?? "",
      ]),
    ];
    return csvResponse(toCsv(rows), "coin-orders.csv");
  }

  const { rows: entries } = await loadEntryRows();
  const rows: (string | number)[][] = [ENTRY_COLUMNS.map((col) => col.header), ...entries.map((e) => ENTRY_COLUMNS.map((col) => e[col.key]))];
  return csvResponse(toCsv(rows), "team-scores.csv");
}
