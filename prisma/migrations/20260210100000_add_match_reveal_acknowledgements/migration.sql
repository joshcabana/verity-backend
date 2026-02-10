ALTER TABLE "Match"
ADD COLUMN "userARevealAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN "userBRevealAcknowledgedAt" TIMESTAMP(3);

UPDATE "Match"
SET
  "userARevealAcknowledgedAt" = NOW(),
  "userBRevealAcknowledgedAt" = NOW()
WHERE
  "userARevealAcknowledgedAt" IS NULL
  OR "userBRevealAcknowledgedAt" IS NULL;
