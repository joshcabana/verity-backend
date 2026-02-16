-- CreateTable
CREATE TABLE "ModerationAppeal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "moderationReportId" TEXT,
    "actionType" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolverUserId" TEXT,
    CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventSchemaVersion" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "buildNumber" TEXT,
    "region" TEXT,
    "requestId" TEXT,
    "userId" TEXT,
    "sessionId" TEXT,
    "matchId" TEXT,
    "queueKey" TEXT,
    "properties" JSONB NOT NULL,
    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsIngestHourly" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hourStart" TIMESTAMP(3) NOT NULL,
    "eventName" TEXT NOT NULL,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "droppedCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AnalyticsIngestHourly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryGateSnapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "waitP50Seconds" DOUBLE PRECISION,
    "waitP90Seconds" DOUBLE PRECISION,
    "abandonmentRate" DOUBLE PRECISION,
    "completionRate" DOUBLE PRECISION,
    "mutualMatchRate" DOUBLE PRECISION,
    "chatActivationRate" DOUBLE PRECISION,
    "severeIncidentPer10k" DOUBLE PRECISION,
    "appealOverturnRate" DOUBLE PRECISION,
    "severeActionLatencyP95" DOUBLE PRECISION,
    "stage0Status" TEXT NOT NULL,
    "stage1Status" TEXT NOT NULL,
    "stage2Status" TEXT NOT NULL,
    "autoPauseTriggered" BOOLEAN NOT NULL DEFAULT false,
    "autoPauseReasons" JSONB,
    CONSTRAINT "TelemetryGateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationAppeal_userId_status_idx" ON "ModerationAppeal"("userId", "status");

-- CreateIndex
CREATE INDEX "ModerationAppeal_status_createdAt_idx" ON "ModerationAppeal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationAppeal_moderationReportId_idx" ON "ModerationAppeal"("moderationReportId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEvent_eventId_key" ON "AnalyticsEvent"("eventId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_occurredAt_idx" ON "AnalyticsEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_eventName_occurredAt_idx" ON "AnalyticsEvent"("eventName", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_platform_occurredAt_idx" ON "AnalyticsEvent"("platform", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsIngestHourly_hourStart_eventName_key" ON "AnalyticsIngestHourly"("hourStart", "eventName");

-- CreateIndex
CREATE INDEX "AnalyticsIngestHourly_hourStart_idx" ON "AnalyticsIngestHourly"("hourStart");

-- CreateIndex
CREATE INDEX "TelemetryGateSnapshot_windowEnd_idx" ON "TelemetryGateSnapshot"("windowEnd");

-- AddForeignKey
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_moderationReportId_fkey" FOREIGN KEY ("moderationReportId") REFERENCES "ModerationReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
