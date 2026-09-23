import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LEDGER_REASON_LABEL, WALLET_LABEL } from "@/lib/scoring";

export const dynamic = "force-dynamic";

// نمای راست‌به‌چپ برای همهٔ شیت‌ها + هدر بولد و ثابت (freeze) روی سطر اول
function setupSheet(ws: ExcelJS.Worksheet, headers: { header: string; key: string; width: number }[]) {
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];
  ws.columns = headers;
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { horizontal: "right" };
}

/**
 * ساخت بافر فایل اکسل — بدون وابستگی به درخواست HTTP یا احراز هویت، تا هم از GET
 * و هم مستقیماً از اسکریپت دود-تست (scripts/smoke-reports.ts) قابل فراخوانی باشد.
 * هیچ ستون passwordHash در هیچ شیتی نوشته نمی‌شود.
 */
export async function buildExportWorkbookBuffer(): Promise<Buffer> {
  const [teams, scores, users, ideas, investments, purchases, bids, ledger] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true, slug: true, treasury: true } }),
    prisma.teamScore.findMany(),
    prisma.user.findMany({
      select: {
        id: true,
        nickname: true,
        email: true,
        role: true,
        power: true,
        isAdmin: true,
        department: true,
        teamId: true,
        seedWallet: true,
        buyWallet: true,
        createdAt: true,
      },
    }),
    prisma.idea.findMany({ select: { id: true, teamId: true, title: true, oneLiner: true, fundingCap: true, revenueShare: true, submittedAt: true } }),
    prisma.investment.findMany({ select: { id: true, ideaId: true, userId: true, amount: true, selfFunded: true, createdAt: true } }),
    prisma.purchase.findMany({ select: { id: true, productId: true, userId: true, amount: true, discount: true, createdAt: true } }),
    prisma.bid.findMany({ select: { id: true, auctionId: true, userId: true, amount: true, createdAt: true } }),
    prisma.ledgerEntry.findMany({ select: { id: true, userId: true, teamId: true, wallet: true, delta: true, reason: true, refId: true, createdAt: true } }),
  ]);

  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const scoreByTeam = new Map(scores.map((s) => [s.teamId, s]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "میدان بنیان‌گذاران تپسل";
  wb.created = new Date();

  // ---------- Teams and scores ----------
  const wsTeams = wb.addWorksheet("Teams and scores");
  setupSheet(wsTeams, [
    { header: "شناسه تیم", key: "id", width: 22 },
    { header: "نام تیم", key: "name", width: 22 },
    { header: "اسلاگ", key: "slug", width: 16 },
    { header: "خزانه", key: "treasury", width: 12 },
    { header: "رتبه", key: "rank", width: 8 },
    { header: "فروش ناخالص", key: "grossSales", width: 14 },
    { header: "سود پرداختی", key: "dividendsPaid", width: 14 },
    { header: "فروش خالص", key: "netSales", width: 12 },
    { header: "سرمایهٔ خارجی", key: "externalCapital", width: 14 },
    { header: "سرمایهٔ خودی", key: "selfCapital", width: 14 },
    { header: "بازده سرمایه‌گذار", key: "investorRoi", width: 16 },
    { header: "خریداران یکتا", key: "uniqueBuyers", width: 14 },
    { header: "قلب‌ها", key: "hearts", width: 10 },
    { header: "کیفیت", key: "quality", width: 10 },
    { header: "تیزر", key: "teaser", width: 10 },
    { header: "جریمهٔ خرج‌نشده", key: "unspentPenalty", width: 16 },
    { header: "امتیاز کل", key: "total", width: 12 },
    { header: "زمان محاسبه", key: "computedAt", width: 20 },
  ]);
  for (const t of teams) {
    const s = scoreByTeam.get(t.id);
    wsTeams.addRow({
      id: t.id,
      name: t.name,
      slug: t.slug,
      treasury: t.treasury,
      rank: s?.rank ?? "",
      grossSales: s?.grossSales ?? 0,
      dividendsPaid: s?.dividendsPaid ?? 0,
      netSales: s?.netSales ?? 0,
      externalCapital: s?.externalCapital ?? 0,
      selfCapital: s?.selfCapital ?? 0,
      investorRoi: s ? Math.round(s.investorRoi * 1000) / 10 : 0,
      uniqueBuyers: s?.uniqueBuyers ?? 0,
      hearts: s?.hearts ?? 0,
      quality: s?.quality ?? 0,
      teaser: s?.teaser ?? 0,
      unspentPenalty: s?.unspentPenalty ?? 0,
      total: s?.total ?? 0,
      computedAt: s?.computedAt ?? "",
    });
  }

  // ---------- Users (بدون passwordHash) ----------
  const wsUsers = wb.addWorksheet("Users");
  setupSheet(wsUsers, [
    { header: "شناسه", key: "id", width: 22 },
    { header: "نام مستعار", key: "nickname", width: 18 },
    { header: "ایمیل", key: "email", width: 26 },
    { header: "نقش", key: "role", width: 14 },
    { header: "قدرت", key: "power", width: 14 },
    { header: "ادمین", key: "isAdmin", width: 10 },
    { header: "دپارتمان", key: "department", width: 16 },
    { header: "تیم", key: "team", width: 20 },
    { header: "کیف بذر", key: "seedWallet", width: 12 },
    { header: "کیف خرید", key: "buyWallet", width: 12 },
    { header: "تاریخ ثبت‌نام", key: "createdAt", width: 20 },
  ]);
  for (const u of users) {
    wsUsers.addRow({
      id: u.id,
      nickname: u.nickname,
      email: u.email,
      role: u.role,
      power: u.power,
      isAdmin: u.isAdmin ? "بله" : "خیر",
      department: u.department,
      team: u.teamId ? teamNames.get(u.teamId) ?? u.teamId : "",
      seedWallet: u.seedWallet,
      buyWallet: u.buyWallet,
      createdAt: u.createdAt,
    });
  }

  // ---------- Ideas ----------
  const wsIdeas = wb.addWorksheet("Ideas");
  setupSheet(wsIdeas, [
    { header: "شناسه", key: "id", width: 22 },
    { header: "تیم", key: "team", width: 20 },
    { header: "عنوان", key: "title", width: 24 },
    { header: "یک‌خطی", key: "oneLiner", width: 30 },
    { header: "سقف سرمایه", key: "fundingCap", width: 12 },
    { header: "سهم سرمایه‌گذار (٪)", key: "revenueShare", width: 16 },
    { header: "زمان ثبت", key: "submittedAt", width: 20 },
  ]);
  for (const i of ideas) {
    wsIdeas.addRow({
      id: i.id,
      team: teamNames.get(i.teamId) ?? i.teamId,
      title: i.title,
      oneLiner: i.oneLiner,
      fundingCap: i.fundingCap,
      revenueShare: i.revenueShare,
      submittedAt: i.submittedAt ?? "",
    });
  }

  // ---------- Investments ----------
  const wsInv = wb.addWorksheet("Investments");
  setupSheet(wsInv, [
    { header: "شناسه", key: "id", width: 22 },
    { header: "ایده", key: "ideaId", width: 22 },
    { header: "کاربر", key: "userId", width: 22 },
    { header: "مبلغ", key: "amount", width: 12 },
    { header: "خودی", key: "selfFunded", width: 10 },
    { header: "زمان", key: "createdAt", width: 20 },
  ]);
  for (const i of investments) {
    wsInv.addRow({ id: i.id, ideaId: i.ideaId, userId: i.userId, amount: i.amount, selfFunded: i.selfFunded ? "بله" : "خیر", createdAt: i.createdAt });
  }

  // ---------- Purchases ----------
  const wsPur = wb.addWorksheet("Purchases");
  setupSheet(wsPur, [
    { header: "شناسه", key: "id", width: 22 },
    { header: "محصول", key: "productId", width: 22 },
    { header: "کاربر", key: "userId", width: 22 },
    { header: "مبلغ", key: "amount", width: 12 },
    { header: "تخفیف", key: "discount", width: 10 },
    { header: "زمان", key: "createdAt", width: 20 },
  ]);
  for (const p of purchases) {
    wsPur.addRow({ id: p.id, productId: p.productId, userId: p.userId, amount: p.amount, discount: p.discount, createdAt: p.createdAt });
  }

  // ---------- Bids ----------
  const wsBids = wb.addWorksheet("Bids");
  setupSheet(wsBids, [
    { header: "شناسه", key: "id", width: 22 },
    { header: "حراج", key: "auctionId", width: 22 },
    { header: "کاربر", key: "userId", width: 22 },
    { header: "مبلغ", key: "amount", width: 12 },
    { header: "زمان", key: "createdAt", width: 20 },
  ]);
  for (const b of bids) {
    wsBids.addRow({ id: b.id, auctionId: b.auctionId, userId: b.userId, amount: b.amount, createdAt: b.createdAt });
  }

  // ---------- Ledger ----------
  const wsLedger = wb.addWorksheet("Ledger");
  setupSheet(wsLedger, [
    { header: "شناسه", key: "id", width: 22 },
    { header: "کاربر", key: "userId", width: 22 },
    { header: "تیم", key: "team", width: 20 },
    { header: "کیف", key: "wallet", width: 12 },
    { header: "تغییر", key: "delta", width: 10 },
    { header: "دلیل", key: "reason", width: 16 },
    { header: "مرجع", key: "refId", width: 22 },
    { header: "زمان", key: "createdAt", width: 20 },
  ]);
  for (const e of ledger) {
    wsLedger.addRow({
      id: e.id,
      userId: e.userId ?? "",
      team: e.teamId ? teamNames.get(e.teamId) ?? e.teamId : "",
      wallet: WALLET_LABEL[e.wallet] ?? e.wallet,
      delta: e.delta,
      reason: LEDGER_REASON_LABEL[e.reason] ?? e.reason,
      refId: e.refId ?? "",
      createdAt: e.createdAt,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

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
