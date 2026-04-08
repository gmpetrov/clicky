import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";

const activeSubscriptionStatuses = ["active", "trialing"] as const;
const usdToMicrosMultiplier = 1_000_000;

const baseUsageEventSchema = z.object({
  idempotencyKey: z.string().min(1),
  model: z.string().min(1).optional(),
  externalRequestId: z.string().min(1).optional(),
  requestStartedAt: z.coerce.date().optional(),
  requestCompletedAt: z.coerce.date().optional(),
});

export const workerUsageEventSchema = baseUsageEventSchema.extend({
  userId: z.string().min(1),
  provider: z.enum(["openrouter", "elevenlabs"]),
  operation: z.enum(["chat_completion", "text_to_speech"]),
  rawUsage: z
    .object({
      promptTokens: z.number().int().nonnegative().optional(),
      completionTokens: z.number().int().nonnegative().optional(),
      totalTokens: z.number().int().nonnegative().optional(),
      cachedTokens: z.number().int().nonnegative().optional(),
      textCharacters: z.number().int().nonnegative().optional(),
      reportedCostUsd: z.number().nonnegative().optional(),
    })
    .strict(),
});

export const desktopUsageEventSchema = baseUsageEventSchema.extend({
  provider: z.literal("assemblyai"),
  operation: z.literal("streaming_transcription"),
  rawUsage: z
    .object({
      sessionDurationSeconds: z.number().nonnegative(),
      keytermsEnabled: z.boolean().default(false),
    })
    .strict(),
});

type WorkerUsageEventInput = z.infer<typeof workerUsageEventSchema>;
type DesktopUsageEventInput = z.infer<typeof desktopUsageEventSchema>;
type PersistedUsageEventInput = WorkerUsageEventInput | (DesktopUsageEventInput & { userId: string });

type UsageBillingContext = {
  subscriptionId: string | null;
  billingPeriodKey: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
};

type CostComputationResult = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  textCharacters?: number;
  audioDurationMilliseconds?: number;
  computedCostMicros: bigint;
  costSource: string;
  rawUsagePayload: Prisma.InputJsonValue;
};

export async function ingestWorkerUsageEvent(input: WorkerUsageEventInput) {
  return persistUsageEvent(input);
}

export async function ingestDesktopUsageEvent(userId: string, input: DesktopUsageEventInput) {
  return persistUsageEvent({
    ...input,
    userId,
  });
}

async function persistUsageEvent(input: PersistedUsageEventInput) {
  const requestCompletedAt = input.requestCompletedAt ?? new Date();
  const usageBillingContext = await resolveUsageBillingContext(input.userId, requestCompletedAt);
  const costComputation = computeUsageCost(input);

  try {
    return await prisma.$transaction(async (transaction) => {
      const existingUsageEvent = await transaction.usageEvent.findUnique({
        where: {
          idempotencyKey: input.idempotencyKey,
        },
      });

      if (existingUsageEvent) {
        return {
          usageEvent: existingUsageEvent,
          wasDuplicate: true,
        };
      }

      const createdUsageEvent = await transaction.usageEvent.create({
        data: {
          userId: input.userId,
          subscriptionId: usageBillingContext.subscriptionId,
          billingPeriodKey: usageBillingContext.billingPeriodKey,
          periodStart: usageBillingContext.periodStart,
          periodEnd: usageBillingContext.periodEnd,
          provider: input.provider,
          operation: input.operation,
          model: input.model,
          externalRequestId: input.externalRequestId,
          idempotencyKey: input.idempotencyKey,
          requestStartedAt: input.requestStartedAt,
          requestCompletedAt,
          promptTokens: costComputation.promptTokens,
          completionTokens: costComputation.completionTokens,
          totalTokens: costComputation.totalTokens,
          cachedTokens: costComputation.cachedTokens,
          textCharacters: costComputation.textCharacters,
          audioDurationMilliseconds: costComputation.audioDurationMilliseconds,
          computedCostMicros: costComputation.computedCostMicros,
          costSource: costComputation.costSource,
          rawUsagePayload: costComputation.rawUsagePayload,
        },
      });

      if (
        usageBillingContext.billingPeriodKey &&
        usageBillingContext.periodStart &&
        usageBillingContext.periodEnd
      ) {
        await upsertUsagePeriodSummary(transaction, {
          userId: input.userId,
          subscriptionId: usageBillingContext.subscriptionId,
          billingPeriodKey: usageBillingContext.billingPeriodKey,
          periodStart: usageBillingContext.periodStart,
          periodEnd: usageBillingContext.periodEnd,
          provider: input.provider,
          computedCostMicros: costComputation.computedCostMicros,
        });
      }

      return {
        usageEvent: createdUsageEvent,
        wasDuplicate: false,
      };
    });
  } catch (error) {
    if (isPrismaDuplicateIdempotencyError(error)) {
      const existingUsageEvent = await prisma.usageEvent.findUnique({
        where: {
          idempotencyKey: input.idempotencyKey,
        },
      });

      return {
        usageEvent: existingUsageEvent,
        wasDuplicate: true,
      };
    }

    throw error;
  }
}

function computeUsageCost(input: PersistedUsageEventInput): CostComputationResult {
  if (input.provider === "openrouter") {
    const reportedCostUsd = input.rawUsage.reportedCostUsd ?? 0;

    return {
      promptTokens: input.rawUsage.promptTokens,
      completionTokens: input.rawUsage.completionTokens,
      totalTokens: input.rawUsage.totalTokens,
      cachedTokens: input.rawUsage.cachedTokens,
      computedCostMicros: usdToMicros(reportedCostUsd),
      costSource:
        input.rawUsage.reportedCostUsd == null ? "provider_report_missing" : "provider_reported",
      rawUsagePayload: input.rawUsage as Prisma.InputJsonValue,
    };
  }

  if (input.provider === "elevenlabs") {
    const textCharacters = input.rawUsage.textCharacters ?? 0;
    const computedCostUsd =
      (textCharacters / 1_000) * serverEnv.ELEVENLABS_FLASH_V2_5_PRICE_PER_1K_CHARACTERS_USD;

    return {
      textCharacters,
      computedCostMicros: usdToMicros(computedCostUsd),
      costSource: "configured_rate",
      rawUsagePayload: input.rawUsage as Prisma.InputJsonValue,
    };
  }

  const assemblyAIInput = input as DesktopUsageEventInput & { userId: string };
  const audioDurationMilliseconds = Math.round(
    assemblyAIInput.rawUsage.sessionDurationSeconds * 1_000,
  );
  const hourlyRateUsd =
    serverEnv.ASSEMBLYAI_U3_RT_PRO_PRICE_PER_HOUR_USD +
    (assemblyAIInput.rawUsage.keytermsEnabled
      ? serverEnv.ASSEMBLYAI_KEYTERMS_PRICE_PER_HOUR_USD
      : 0);
  const computedCostUsd =
    (assemblyAIInput.rawUsage.sessionDurationSeconds / 3_600) * hourlyRateUsd;

  return {
    audioDurationMilliseconds,
    computedCostMicros: usdToMicros(computedCostUsd),
    costSource: "configured_rate",
    rawUsagePayload: assemblyAIInput.rawUsage as Prisma.InputJsonValue,
  };
}

async function resolveUsageBillingContext(
  userId: string,
  usageTimestamp: Date,
): Promise<UsageBillingContext> {
  const activeSubscription =
    (await prisma.subscription.findFirst({
      where: {
        referenceId: userId,
        status: {
          in: [...activeSubscriptionStatuses],
        },
        OR: [
          {
            periodStart: {
              lte: usageTimestamp,
            },
            periodEnd: {
              gte: usageTimestamp,
            },
          },
          {
            periodStart: {
              lte: usageTimestamp,
            },
            periodEnd: null,
          },
          {
            periodStart: null,
            periodEnd: {
              gte: usageTimestamp,
            },
          },
        ],
      },
      orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
    })) ??
    (await prisma.subscription.findFirst({
      where: {
        referenceId: userId,
        status: {
          in: [...activeSubscriptionStatuses],
        },
      },
      orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
    }));

  if (!activeSubscription) {
    return {
      subscriptionId: null,
      billingPeriodKey: null,
      periodStart: null,
      periodEnd: null,
    };
  }

  if (!activeSubscription.periodStart || !activeSubscription.periodEnd) {
    return {
      subscriptionId: activeSubscription.id,
      billingPeriodKey: null,
      periodStart: activeSubscription.periodStart,
      periodEnd: activeSubscription.periodEnd,
    };
  }

  return {
    subscriptionId: activeSubscription.id,
    billingPeriodKey: makeBillingPeriodKey({
      userId,
      subscriptionId: activeSubscription.id,
      periodStart: activeSubscription.periodStart,
      periodEnd: activeSubscription.periodEnd,
    }),
    periodStart: activeSubscription.periodStart,
    periodEnd: activeSubscription.periodEnd,
  };
}

async function upsertUsagePeriodSummary(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    subscriptionId: string | null;
    billingPeriodKey: string;
    periodStart: Date;
    periodEnd: Date;
    provider: PersistedUsageEventInput["provider"];
    computedCostMicros: bigint;
  },
) {
  const providerUpdateData = buildProviderSummaryUpdateData(
    input.provider,
    input.computedCostMicros,
  );
  const providerCreateData = buildProviderSummaryCreateData(
    input.provider,
    input.computedCostMicros,
  );

  await transaction.usagePeriodSummary.upsert({
    where: {
      billingPeriodKey: input.billingPeriodKey,
    },
    update: {
      totalCostMicros: {
        increment: input.computedCostMicros,
      },
      ...providerUpdateData,
    },
    create: {
      billingPeriodKey: input.billingPeriodKey,
      userId: input.userId,
      subscriptionId: input.subscriptionId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      totalCostMicros: input.computedCostMicros,
      ...providerCreateData,
    },
  });
}

function buildProviderSummaryUpdateData(
  provider: PersistedUsageEventInput["provider"],
  computedCostMicros: bigint,
): Prisma.UsagePeriodSummaryUpdateInput {
  if (provider === "openrouter") {
    return {
      openrouterCostMicros: {
        increment: computedCostMicros,
      },
      openrouterEventCount: {
        increment: 1,
      },
    };
  }

  if (provider === "elevenlabs") {
    return {
      elevenLabsCostMicros: {
        increment: computedCostMicros,
      },
      elevenLabsEventCount: {
        increment: 1,
      },
    };
  }

  return {
    assemblyAICostMicros: {
      increment: computedCostMicros,
    },
    assemblyAIEventCount: {
      increment: 1,
    },
  };
}

function buildProviderSummaryCreateData(
  provider: PersistedUsageEventInput["provider"],
  computedCostMicros: bigint,
) {
  return {
    openrouterCostMicros: provider === "openrouter" ? computedCostMicros : 0n,
    elevenLabsCostMicros: provider === "elevenlabs" ? computedCostMicros : 0n,
    assemblyAICostMicros: provider === "assemblyai" ? computedCostMicros : 0n,
    openrouterEventCount: provider === "openrouter" ? 1 : 0,
    elevenLabsEventCount: provider === "elevenlabs" ? 1 : 0,
    assemblyAIEventCount: provider === "assemblyai" ? 1 : 0,
  };
}

function makeBillingPeriodKey(input: {
  userId: string;
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  return [
    input.userId,
    input.subscriptionId,
    input.periodStart.toISOString(),
    input.periodEnd.toISOString(),
  ].join(":");
}

function usdToMicros(usd: number) {
  return BigInt(Math.round(usd * usdToMicrosMultiplier));
}

function isPrismaDuplicateIdempotencyError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
