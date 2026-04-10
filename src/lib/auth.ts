import { stripe as stripePlugin } from "@better-auth/stripe";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth";
import { bearer, deviceAuthorization, magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import Stripe from "stripe";

import { sendPointerlyMagicLinkEmail } from "@/lib/auth-email";
import { prisma } from "@/lib/db";
import { isGoogleAuthConfigured, serverEnv } from "@/lib/env";

const stripeClient = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
});

const socialProviders = isGoogleAuthConfigured
  ? {
      google: {
        clientId: serverEnv.GOOGLE_CLIENT_ID!,
        clientSecret: serverEnv.GOOGLE_CLIENT_SECRET!,
      },
    }
  : {};

export const auth = betterAuth({
  secret: serverEnv.BETTER_AUTH_SECRET,
  baseURL: serverEnv.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders,
  plugins: [
    bearer(),
    magicLink({
      sendMagicLink: async ({ email, url, metadata }) => {
        const flowType = metadata?.flowType === "sign-up" ? "sign-up" : "sign-in";

        await sendPointerlyMagicLinkEmail({
          emailAddress: email,
          magicLinkURL: url,
          flowType,
        });
      },
    }),
    deviceAuthorization({
      verificationUri: "/device",
      validateClient: async (clientId) => {
        return clientId == serverEnv.CLICKY_DESKTOP_CLIENT_ID;
      },
    }),
    stripePlugin({
      stripeClient,
      stripeWebhookSecret: serverEnv.STRIPE_WEBHOOK_SECRET,
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: [
          {
            name: "starter",
            priceId: serverEnv.STRIPE_STARTER_MONTHLY_PRICE_ID,
            limits: {
              screens: 10,
              assistants: 1,
            },
          },
        ],
        authorizeReference: async ({ user, referenceId }) => {
          return referenceId === user.id;
        },
        getCheckoutSessionParams: async () => {
          return {
            params: {
              allow_promotion_codes: true,
            },
          };
        },
      },
    }),
    nextCookies(),
  ],
});
