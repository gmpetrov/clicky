"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient, clearStoredBearerToken } from "@/lib/auth-client";

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleCheckout() {
    setErrorMessage(null);
    setIsLoadingCheckout(true);

    const { error } = await authClient.subscription.upgrade({
      plan: "starter",
      successUrl: "/dashboard",
      cancelUrl: "/pricing",
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
