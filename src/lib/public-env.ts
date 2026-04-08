import { z } from "zod";

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: z.enum(["true", "false"]).default("false"),
  NEXT_PUBLIC_CLICKY_PRICE_MONTHLY: z.coerce.number().positive(),
});

export const publicEnv = publicEnvironmentSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED,
  NEXT_PUBLIC_CLICKY_PRICE_MONTHLY: process.env.NEXT_PUBLIC_CLICKY_PRICE_MONTHLY,
});
