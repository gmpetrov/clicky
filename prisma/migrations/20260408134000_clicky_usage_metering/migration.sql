-- CreateTable
CREATE TABLE "usageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "billingPeriodKey" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT,
    "externalRequestId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestStartedAt" TIMESTAMP(3),
    "requestCompletedAt" TIMESTAMP(3) NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "cachedTokens" INTEGER,
    "textCharacters" INTEGER,
    "audioDurationMilliseconds" INTEGER,
    "computedCostMicros" BIGINT NOT NULL,
    "costSource" TEXT NOT NULL,
    "rawUsagePayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usagePeriodSummary" (
    "id" TEXT NOT NULL,
    "billingPeriodKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalCostMicros" BIGINT NOT NULL DEFAULT 0,
    "openrouterCostMicros" BIGINT NOT NULL DEFAULT 0,
    "elevenLabsCostMicros" BIGINT NOT NULL DEFAULT 0,
    "assemblyAICostMicros" BIGINT NOT NULL DEFAULT 0,
    "openrouterEventCount" INTEGER NOT NULL DEFAULT 0,
    "elevenLabsEventCount" INTEGER NOT NULL DEFAULT 0,
    "assemblyAIEventCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usagePeriodSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usageEvent_idempotencyKey_key" ON "usageEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "usageEvent_userId_createdAt_idx" ON "usageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "usageEvent_billingPeriodKey_idx" ON "usageEvent"("billingPeriodKey");

-- CreateIndex
CREATE INDEX "usageEvent_subscriptionId_createdAt_idx" ON "usageEvent"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "usagePeriodSummary_billingPeriodKey_key" ON "usagePeriodSummary"("billingPeriodKey");

-- CreateIndex
CREATE INDEX "usagePeriodSummary_userId_periodEnd_idx" ON "usagePeriodSummary"("userId", "periodEnd");

-- AddForeignKey
ALTER TABLE "usageEvent" ADD CONSTRAINT "usageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usagePeriodSummary" ADD CONSTRAINT "usagePeriodSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
