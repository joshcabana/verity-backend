-- CreateIndex
CREATE INDEX "Session_userAId_idx" ON "Session"("userAId");

-- CreateIndex
CREATE INDEX "Session_userBId_idx" ON "Session"("userBId");

-- CreateIndex
CREATE INDEX "ModerationEvent_userId_idx" ON "ModerationEvent"("userId");
