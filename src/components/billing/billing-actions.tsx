"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient, clearStoredBearerToken } from "@/lib/auth-client";
import { getMetaAttributionStripeMetadata } from "@/lib/meta-attribution";
import { publicEnv } from "@/lib/public-env";
import { initiateCheckout } from "@/lib/meta-pixel";

type BillingActionsProps = {
  hasActiveSubscription: boolean;
  currentPlanName: string;
  currentSubscriptionStatus?: string | null;
};

export function BillingActions({
  hasActiveSubscription,
  currentPlanName,
  currentSubscriptionStatus,
}: BillingActionsProps) {
  const router = useRouter();
  const authSession = authClient.useSession();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleCheckout() {
    setErrorMessage(null);
    setIsLoadingCheckout(true);

    const paymentSuccessURL =
      `${publicEnv.NEXT_PUBLIC_APP_URL}/payment-success?checkout_session_id={CHECKOUT_SESSION_ID}`;
    const pricingPageURL = `${publicEnv.NEXT_PUBLIC_APP_URL}/pricing`;

    initiateCheckout({
      emailAddress: authSession.data?.user?.email,
      externalUserId: authSession.data?.user?.id,
      planName: currentPlanName,
      value: publicEnv.NEXT_PUBLIC_CLICKY_PRICE_MONTHLY,
    });

    const { error } = await authClient.subscription.upgrade({
      plan: "starter",
      successUrl: paymentSuccessURL,
      cancelUrl: pricingPageURL,
      metadata: getMetaAttributionStripeMetadata(),
    });

    setIsLoadingCheckout(false);

    if (error) {
      setErrorMessage(error.message ?? "Unable to create a checkout session.");
    }
  }

  async function handleBillingPortal() {
    setErrorMessage(null);
    setIsLoadingPortal(true);

    const { error } = await authClient.subscription.billingPortal({
      returnUrl: "/dashboard",
    });

    setIsLoadingPortal(false);

    if (error) {
      setErrorMessage(error.message ?? "Unable to open the billing portal.");
    }
  }

  async function handleSignOut() {
    setErrorMessage(null);
    setIsSigningOut(true);

    const { error } = await authClient.signOut();

    setIsSigningOut(false);

    if (error) {
      setErrorMessage(error.message ?? "Unable to sign out right now.");
      return;
    }

    clearStoredBearerToken();
    router.push("/");
    router.refresh();
  }

  return (
    <section className="dash-billing">
      <div className="dash-section-label">Billing</div>

      <div className="dash-billing-plan-row">
        <div>
          <div className="dash-billing-plan-name">{currentPlanName}</div>
          {currentSubscriptionStatus && (
            <div className="dash-billing-plan-status">{currentSubscriptionStatus}</div>
          )}
        </div>

        {hasActiveSubscription ? (
          <button
            className="secondary-button"
            disabled={isLoadingPortal}
            onClick={handleBillingPortal}
            type="button"
          >
            {isLoadingPortal ? "Opening..." : "Manage billing"}
          </button>
        ) : (
          <button
            className="primary-button"
            disabled={isLoadingCheckout}
            onClick={handleCheckout}
            type="button"
          >
            {isLoadingCheckout ? "Opening..." : "Subscribe"}
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="dash-billing-error">{errorMessage}</div>
      )}

      <button
        className="dash-signout-button"
        disabled={isSigningOut}
        onClick={handleSignOut}
        type="button"
      >
        {isSigningOut ? "Signing out..." : "Sign out"}
      </button>
    </section>
  );
}
