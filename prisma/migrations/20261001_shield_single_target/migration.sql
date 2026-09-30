-- AddColumn (plain ALTER TABLE keeps live data in place; no table rebuild)
-- قدرت سپر: تیم هدفی که دارندهٔ سپر یک‌بار انتخاب می‌کند؛ null یعنی هنوز انتخاب نشده.
ALTER TABLE "User" ADD COLUMN "shieldTeamId" TEXT;
