-- لینک دعوت تیم با توکن تصادفی به‌جای اسلاگ عمومی، و ایندکس‌های پیشنهادی ممیزی کارایی.
-- AddColumn (plain ALTER TABLE keeps live data in place; no table rebuild)
ALTER TABLE "Team" ADD COLUMN "inviteToken" TEXT;

-- تیم‌های موجود توکن تصادفی ۱۲۸ بیتی می‌گیرند؛ تیم‌های تازه از @default(uuid()) در Prisma.
UPDATE "Team" SET "inviteToken" = lower(hex(randomblob(16))) WHERE "inviteToken" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Team_inviteToken_key" ON "Team"("inviteToken");
CREATE INDEX "User_teamId_idx" ON "User"("teamId");
CREATE INDEX "DueDiligenceMessage_ideaId_idx" ON "DueDiligenceMessage"("ideaId");
CREATE INDEX "Purchase_createdAt_idx" ON "Purchase"("createdAt");
CREATE INDEX "CollusionFlag_teamId_idx" ON "CollusionFlag"("teamId");

-- ایندکس ترکیبی (status, order) جای ایندکس تک‌ستونی status را می‌گیرد
DROP INDEX "Auction_status_idx";
CREATE INDEX "Auction_status_order_idx" ON "Auction"("status", "order");
