import { NextResponse } from "next/server";

import { getBillingSnapshot } from "@/lib/billing";

export async function GET(request: Request) {
  const billingSnapshot = await getBillingSnapshot(request.headers);

  if (!billingSnapshot.session) {
    return NextResponse.json(
      {
        authenticated: false,
      },
      {
        status: 401,
      },
    );
  }

  return NextResponse.json({
    authenticated: true,
    isEntitled: billingSnapshot.isEntitled,
    user: billingSnapshot.session.user,
    session: billingSnapshot.session.session,
    activeSubscription: billingSnapshot.activeSubscription,
    subscriptions: billingSnapshot.subscriptions,
  });
}
