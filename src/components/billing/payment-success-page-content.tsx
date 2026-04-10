"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { authClient } from "@/lib/auth-client";
import { getMetaAttributionStripeMetadata } from "@/lib/meta-attribution";
import { purchase } from "@/lib/meta-pixel";
import { publicEnv } from "@/lib/public-env";

type PaymentSuccessPageContentProps = {
  checkoutSessionId: string | null;
};

const trackedPurchaseStorageKeyPrefix = "clicky_meta_purchase_";
const metaPixelReadyPollIntervalMilliseconds = 100;
const metaPixelReadyTimeoutMilliseconds = 2500;

export function PaymentSuccessPageContent({
  checkoutSessionId,
}: PaymentSuccessPageContentProps) {
  const router = useRouter();
  const authSession = authClient.useSession();
  const hasStartedPurchaseCompletionRef = useRef(false);

  useEffect(() => {
    if (authSession.isPending || hasStartedPurchaseCompletionRef.current) {
      return;
    }

    const paymentSuccessPath = checkoutSessionId
      ? `/payment-success?checkout_session_id=${encodeURIComponent(checkoutSessionId)}`
      : "/payment-success";
    const currentUser = authSession.data?.user;

    if (!currentUser) {
      hasStartedPurchaseCompletionRef.current = true;
      router.replace(`/sign-in?next=${encodeURIComponent(paymentSuccessPath)}`);
      return;
    }

    if (!checkoutSessionId) {
      hasStartedPurchaseCompletionRef.current = true;
      return;
    }

    hasStartedPurchaseCompletionRef.current = true;

    const trackedPurchaseStorageKey = `${trackedPurchaseStorageKeyPrefix}${checkoutSessionId}`;
    const stripeAttributionMetadata = getMetaAttributionStripeMetadata();
    let hasFinishedPurchaseCompletion = false;
    let metaPixelReadyPollIntervalId: number | null = null;
    let metaPixelReadyTimeoutId: number | null = null;

    if (Object.keys(stripeAttributionMetadata).length > 0) {
      void fetch("/api/stripe/attribution", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          checkoutSessionId,
          stripeMetadata: stripeAttributionMetadata,
        }),
      }).catch(() => {
        return undefined;
      });
    }

    const finishPurchaseCompletion = (shouldTrackPurchase: boolean) => {
      if (hasFinishedPurchaseCompletion) {
        return;
      }

      hasFinishedPurchaseCompletion = true;

      if (shouldTrackPurchase) {
        purchase({
          emailAddress: currentUser.email,
          externalUserId: currentUser.id,
          planName: "Starter",
          transactionId: checkoutSessionId,
          value: publicEnv.NEXT_PUBLIC_CLICKY_PRICE_MONTHLY,
        });

        try {
          window.localStorage.setItem(trackedPurchaseStorageKey, "1");
        } catch {}
      }

      if (metaPixelReadyPollIntervalId !== null) {
        window.clearInterval(metaPixelReadyPollIntervalId);
      }

      if (metaPixelReadyTimeoutId !== null) {
        window.clearTimeout(metaPixelReadyTimeoutId);
      }
    };

    try {
      if (window.localStorage.getItem(trackedPurchaseStorageKey)) {
        finishPurchaseCompletion(false);
        return;
      }
    } catch {}

    if (!publicEnv.NEXT_PUBLIC_META_PIXEL_ID) {
      finishPurchaseCompletion(false);
      return;
    }

    metaPixelReadyPollIntervalId = window.setInterval(() => {
      if (window.fbq) {
        finishPurchaseCompletion(true);
      }
    }, metaPixelReadyPollIntervalMilliseconds);

    metaPixelReadyTimeoutId = window.setTimeout(() => {
      finishPurchaseCompletion(Boolean(window.fbq));
    }, metaPixelReadyTimeoutMilliseconds);

    if (window.fbq) {
      finishPurchaseCompletion(true);
    }

    return () => {
      if (metaPixelReadyPollIntervalId !== null) {
        window.clearInterval(metaPixelReadyPollIntervalId);
      }

      if (metaPixelReadyTimeoutId !== null) {
        window.clearTimeout(metaPixelReadyTimeoutId);
      }
    };
  }, [
    authSession.data?.user,
    authSession.isPending,
    checkoutSessionId,
    router,
  ]);

  return (
    <main className="centered-page">
      <section className="auth-panel">
        <h1>Subscription active</h1>
        <p className="auth-copy">
          {checkoutSessionId
            ? "Your checkout is complete. This page stays here so the purchase event has time to fire."
            : "Your checkout is complete. This page stays here until you decide to continue."}
        </p>
        <Link href="/dashboard" className="primary-button auth-button">
          Go to dashboard
        </Link>
      </section>
    </main>
  );
}
