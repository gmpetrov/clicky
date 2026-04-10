import "server-only";

import { z } from "zod";

import { publicEnv } from "@/lib/public-env";

const serverEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_CA_CERT: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  CLICKY_DESKTOP_CLIENT_ID: z.string().min(1),
  USAGE_METERING_SECRET: z.string().min(32),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_STARTER_PRODUCT_ID: z.string().startsWith("prod_"),
  STRIPE_STARTER_MONTHLY_PRICE_ID: z.string().startsWith("price_"),
  OPENROUTER_API_KEY: z.string().startsWith("sk-or-"),
  OPENROUTER_MODEL: z.string().min(1),
  OPENROUTER_OPUS_MODEL: z.string().min(1),
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_VOICE_ID: z.string().min(1),
  ASSEMBLYAI_API_KEY: z.string().min(1),
  ELEVENLABS_FLASH_V2_5_PRICE_PER_1K_CHARACTERS_USD: z.coerce.number().positive(),
  ASSEMBLYAI_U3_RT_PRO_PRICE_PER_HOUR_USD: z.coerce.number().positive(),
  ASSEMBLYAI_KEYTERMS_PRICE_PER_HOUR_USD: z.coerce.number().nonnegative(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().startsWith("re_"),
});

export const serverEnv = serverEnvironmentSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_CA_CERT: process.env.DATABASE_CA_CERT,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  CLICKY_DESKTOP_CLIENT_ID: process.env.CLICKY_DESKTOP_CLIENT_ID,
  USAGE_METERING_SECRET: process.env.USAGE_METERING_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_STARTER_PRODUCT_ID: process.env.STRIPE_STARTER_PRODUCT_ID,
  STRIPE_STARTER_MONTHLY_PRICE_ID: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  OPENROUTER_OPUS_MODEL: process.env.OPENROUTER_OPUS_MODEL,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
  ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY,
  ELEVENLABS_FLASH_V2_5_PRICE_PER_1K_CHARACTERS_USD:
    process.env.ELEVENLABS_FLASH_V2_5_PRICE_PER_1K_CHARACTERS_USD ?? "0.05",
  ASSEMBLYAI_U3_RT_PRO_PRICE_PER_HOUR_USD:
    process.env.ASSEMBLYAI_U3_RT_PRO_PRICE_PER_HOUR_USD ?? "0.21",
  ASSEMBLYAI_KEYTERMS_PRICE_PER_HOUR_USD:
    process.env.ASSEMBLYAI_KEYTERMS_PRICE_PER_HOUR_USD ?? "0.05",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
});

export const isGoogleAuthConfigured =
  Boolean(serverEnv.GOOGLE_CLIENT_ID) &&
  Boolean(serverEnv.GOOGLE_CLIENT_SECRET) &&
  publicEnv.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
