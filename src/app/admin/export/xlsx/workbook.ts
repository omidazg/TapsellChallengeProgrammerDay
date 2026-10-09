import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { computeScores, LEDGER_REASON_LABEL, WALLET_LABEL } from "@/lib/scoring";
import { getSettledAt, loadSettledOutput } from "@/lib/settlement";
import { SCORE_CATEGORY_ORDER, SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { ROLES, type RoleKey } from "@/lib/constants";

const COIN_ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "در انتظار پرداخت",
  PAID: "پرداخت‌شده",
  FAILED: "ناموفق / ردشده",
  CANCELED: "لغو کاربر",
};

const r1 = (n: number) => Math.round(n * 10) / 10;

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
  const settledAt = await getSettledAt();
  const [output, teams, products, users, ideas, investments, purchases, bids, ledger, coinOrders] = await Promise.all([
    // بعد از تسویه همان عددهای ثبت‌شده در TeamScore؛ پیش از آن محاسبهٔ زنده
    settledAt ? loadSettledOutput() : computeScores(),
    prisma.team.findMany({ select: { id: true, name: true, slug: true, solo: true, cheatNote: true } }),
    prisma.product.findMany({
      select: { teamId: true, name: true, juryWorks: true, juryValue: true, juryPitch: true, aiQuality: true, liveStatus: true },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        nickname: true,
        email: true,
        role: true,
        isAdmin: true,
        department: true,
        teamId: true,
        buyWallet: true,
        createdAt: true,
      },
    }),
    prisma.idea.findMany({ select: { id: true, teamId: true, title: true, oneLiner: true, submittedAt: true } }),
    prisma.investment.findMany({ select: { id: true, ideaId: true, userId: true, amount: true, selfFunded: true, createdAt: true } }),
    prisma.purchase.findMany({ select: { id: true, productId: true, userId: true, amount: true, createdAt: true } }),
    prisma.bid.findMany({ select: { id: true, auctionId: true, userId: true, amount: true, createdAt: true } }),
    prisma.ledgerEntry.findMany({ select: { id: true, userId: true, teamId: true, wallet: true, delta: true, reason: true, refId: true, createdAt: true } }),
    prisma.coinOrder.findMany({
      select: { id: true, userId: true, coins: true, amountRial: true, status: true, gateway: true, refId: true, note: true, createdAt: true, paidAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const resultByTeam = new Map(output.teams.map((r) => [r.teamId, r]));
  const productByTeam = new Map(products.map((p) => [p.teamId, p]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "میدان بنیان‌گذاران";
  wb.created = new Date();

  // ---------- Teams and scores ----------
  const wsTeams = wb.addWorksheet("Teams and scores");
  setupSheet(wsTeams, [
    { header: "شناسه تیم", key: "id", width: 22 },
    { header: "نام تیم", key: "name", width: 22 },
    { header: "اسلاگ", key: "slug", width: 16 },
    { header: "رتبه", key: "rank", width: 8 },
    { header: "تعداد اعضا", key: "memberCount", width: 10 },
    { header: "شرکت فردی", key: "solo", width: 10 },
    { header: "محصول", key: "product", width: 22 },
    { header: "داوری: کار می‌کند؟", key: "juryWorks", width: 14 },
    { header: "داوری: ارزش واقعی", key: "juryValue", width: 14 },
    { header: "داوری: تیزر و ارائه", key: "juryPitch", width: 14 },
    { header: "داوری انسانی (۰..۱۰۰)", key: "juryRaw", width: 14 },
    { header: "حمایت مردمی (خام)", key: "people", width: 14 },
    { header: "تعداد حامیان", key: "supporters", width: 12 },
    { header: "سکهٔ دریافتی", key: "coinsReceived", width: 12 },
    { header: "داوری هوش مصنوعی (۰..۱۰۰)", key: "ai", width: 16 },
    { header: "لایو روی بازار استودیو", key: "live", width: 14 },
    ...SCORE_CATEGORY_ORDER.map((k) => ({ header: `امتیاز ${SCORE_CATEGORY_LABELS[k].label}`, key: `pts_${k}`, width: 14 })),
    { header: "کسر تقلب", key: "cheatPenalty", width: 10 },
    { header: "توضیح کسر تقلب", key: "cheatNote", width: 24 },
    { header: "امتیاز کل", key: "total", width: 12 },
    { header: "وضعیت", key: "state", width: 14 },
  ]);
  for (const t of teams) {
    const s = resultByTeam.get(t.id);
    const p = productByTeam.get(t.id);
    wsTeams.addRow({
      id: t.id,
      name: t.name,
      slug: t.slug,
      rank: s?.rank ?? "",
      memberCount: s?.memberCount ?? "",
      solo: t.solo ? "بله" : "خیر",
      product: p?.name ?? "",
      juryWorks: p?.juryWorks ?? "",
      juryValue: p?.juryValue ?? "",
      juryPitch: p?.juryPitch ?? "",
      juryRaw: s?.juryRaw != null ? r1(s.juryRaw) : "",
      people: s ? r1(s.people) : "",
      supporters: s?.supporters ?? "",
      coinsReceived: s?.coinsReceived ?? "",
      ai: s?.ai != null ? r1(s.ai) : "",
      live: p?.liveStatus === "LIVE" ? "بله" : "خیر",
      ...Object.fromEntries(SCORE_CATEGORY_ORDER.map((k) => [`pts_${k}`, s ? r1(s.pts[k]) : ""])),
      cheatPenalty: s?.cheatPenalty ?? "",
      cheatNote: t.cheatNote,
      total: s ? r1(s.total) : "",
      state: settledAt ? "تسویه‌شده" : "محاسبهٔ زنده",
    });
  }

  // ---------- Users (بدون passwordHash) ----------
  const wsUsers = wb.addWorksheet("Users");
  setupSheet(wsUsers, [
    { header: "شناسه", key: "id", width: 22 },
    { header: "نام مستعار", key: "nickname", width: 18 },
    { header: "ایمیل", key: "email", width: 26 },
    { header: "مهارت", key: "role", width: 14 },
    { header: "ادمین", key: "isAdmin", width: 10 },
    { header: "دپارتمان", key: "department", width: 16 },
    { header: "تیم", key: "team", width: 20 },
    { header: "سکه", key: "coins", width: 12 },
    { header: "تاریخ ثبت‌نام", key: "createdAt", width: 20 },
  ]);
  for (const u of users) {
    wsUsers.addRow({
      id: u.id,
      nickname: u.nickname,
      email: u.email,
      role: ROLES[u.role as RoleKey]?.label ?? u.role,
      isAdmin: u.isAdmin ? "بله" : "خیر",
      department: u.department,
      team: u.teamId ? teamNames.get(u.teamId) ?? u.teamId : "",
      coins: u.buyWallet,
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
    { header: "زمان ثبت", key: "submittedAt", width: 20 },
  ]);
  for (const i of ideas) {
    wsIdeas.addRow({
      id: i.id,
      team: teamNames.get(i.teamId) ?? i.teamId,
      title: i.title,
      oneLiner: i.oneLiner,
      submittedAt: i.submittedAt ?? "",
    });
  }

  // ---------- Investments (حمایت از ایده‌ها؛ نام شیت برای سازگاری با گزارش‌های قبلی ثابت مانده) ----------
  const wsInv = wb.addWorksheet("Investments");
  setupSheet(wsInv, [
    { header: "شناسه", key: "id", width: 22 },
    { header: "ایده", key: "ideaId", width: 22 },
    { header: "حامی", key: "userId", width: 22 },
    { header: "سکهٔ حمایت", key: "amount", width: 12 },
    { header: "حمایت از تیم خود", key: "selfFunded", width: 14 },
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
    { header: "زمان", key: "createdAt", width: 20 },
  ]);
  for (const p of purchases) {
    wsPur.addRow({ id: p.id, productId: p.productId, userId: p.userId, amount: p.amount, createdAt: p.createdAt });
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

  // ---------- Coin orders ----------
  const wsCoins = wb.addWorksheet("Coin orders");
  setupSheet(wsCoins, [
    { header: "شناسه", key: "id", width: 22 },
    { header: "کاربر", key: "userId", width: 22 },
    { header: "سکه", key: "coins", width: 10 },
    { header: "مبلغ (تومان)", key: "toman", width: 14 },
    { header: "وضعیت", key: "status", width: 16 },
    { header: "درگاه", key: "gateway", width: 12 },
    { header: "کد پیگیری", key: "refId", width: 18 },
    { header: "یادداشت", key: "note", width: 24 },
    { header: "زمان ثبت", key: "createdAt", width: 20 },
    { header: "زمان پرداخت", key: "paidAt", width: 20 },
  ]);
  for (const o of coinOrders) {
    wsCoins.addRow({
      id: o.id,
      userId: o.userId,
      coins: o.coins,
      toman: Math.round(o.amountRial / 10),
      status: COIN_ORDER_STATUS_LABEL[o.status] ?? o.status,
      gateway: o.gateway,
      refId: o.refId ?? "",
      note: o.note,
      createdAt: o.createdAt,
      paidAt: o.paidAt ?? "",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
