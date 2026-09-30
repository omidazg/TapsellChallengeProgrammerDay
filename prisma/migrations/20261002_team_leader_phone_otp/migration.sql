-- AddColumns (plain ALTER TABLE keeps live data in place; no table rebuild)
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "Team" ADD COLUMN "leaderId" TEXT;
ALTER TABLE "Team" ADD COLUMN "leaderElectedAt" DATETIME;
ALTER TABLE "AllowedEmail" ADD COLUMN "phone" TEXT;
ALTER TABLE "AccessRequest" ADD COLUMN "phone" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "AllowedEmail_phone_key" ON "AllowedEmail"("phone");

-- CreateTable
CREATE TABLE "TeamLeaderVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TeamLeaderVote_voterId_key" ON "TeamLeaderVote"("voterId");
CREATE INDEX "TeamLeaderVote_teamId_idx" ON "TeamLeaderVote"("teamId");

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OtpCode_phone_purpose_createdAt_idx" ON "OtpCode"("phone", "purpose", "createdAt");
