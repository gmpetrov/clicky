import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { serverEnv } from "@/lib/env";

const stripeClient = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
});

const stripeAttributionRequestBodySchema = z.object({
  checkoutSessionId: z.string().min(1),
  stripeMetadata: z.record(z.string(), z.string()).default({}),
});

function filterStripeMetadata(stripeMetadata: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(stripeMetadata).filter(([, stripeMetadataValue]) => {
      return stripeMetadataValue.trim().length > 0;
    }),
  );
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json(
      {
        error: "not_authenticated",
      },
      {
        status: 401,
      },
    );
  }

  const requestBody = await request.json();
  const { checkoutSessionId, stripeMetadata } =
    stripeAttributionRequestBodySchema.parse(requestBody);
  const filteredStripeMetadata = filterStripeMetadata(stripeMetadata);

  if (Object.keys(filteredStripeMetadata).length === 0) {
    return NextResponse.json({
      ok: true,
      updated: false,
    });
  }

  const checkoutSession =
    await stripeClient.checkout.sessions.retrieve(checkoutSessionId);
  const checkoutSessionUserId = checkoutSession.metadata?.userId;

  if (checkoutSessionUserId !== session.user.id) {
    return NextResponse.json(
      {
        error: "forbidden",
      },
      {
        status: 403,
      },
    );
  }

  if (typeof checkoutSession.customer === "string") {
    await stripeClient.customers.update(checkoutSession.customer, {
      metadata: filteredStripeMetadata,
    });
  }

  if (
    checkoutSession.mode === "subscription" &&
    typeof checkoutSession.subscription === "string"
  ) {
    await stripeClient.subscriptions.update(checkoutSession.subscription, {
      metadata: filteredStripeMetadata,
    });
  }

  return NextResponse.json({
    ok: true,
    updated: true,
  });
}
