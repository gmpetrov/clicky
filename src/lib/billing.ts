import { auth } from "@/lib/auth";

const entitledStatuses = new Set(["active", "trialing"]);

type SessionHeaders = Headers | Awaited<ReturnType<typeof import("next/headers").headers>>;

export async function getBillingSnapshot(headers: SessionHeaders) {
  const session = await auth.api.getSession({
    headers,
  });

  if (!session) {
    return {
      session: null,
      activeSubscription: null,
      subscriptions: [],
      isEntitled: false,
    };
  }

  const subscriptions = await auth.api.listActiveSubscriptions({
    headers,
    query: {
      customerType: "user",
    },
  });

  const activeSubscription =
    subscriptions.find((subscription) => entitledStatuses.has(subscription.status)) ?? null;

  return {
    session,
    subscriptions,
    activeSubscription,
    isEntitled: Boolean(activeSubscription),
  };
}
