-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "region" TEXT,
ADD COLUMN     "queueKey" TEXT;

-- CreateIndex
CREATE INDEX "Session_queueKey_idx" ON "Session"("queueKey");
