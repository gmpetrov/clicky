"use client";

import Link from "next/link";

import { authClient } from "@/lib/auth-client";

export function PricingActions() {
  const session = authClient.useSession();

  if (!session.data?.user) {
    return (
      <div className="pricing-page-actions">
        <Link className="primary-button pricing-page-cta" href="/sign-up?next=/pricing">
          Create account
        </Link>
        <Link className="secondary-button pricing-page-cta" href="/sign-in?next=/pricing">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="pricing-page-actions">
      <Link className="primary-button pricing-page-cta" href="/dashboard">
        Go to dashboard
      </Link>
    </div>
  );
}
