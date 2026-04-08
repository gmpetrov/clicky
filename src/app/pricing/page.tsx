import Link from "next/link";

import { PricingActions } from "@/components/billing/pricing-actions";
import { publicEnv } from "@/lib/public-env";

const planFeatures = [
  "Voice assistant in the menu bar",
  "Screen-aware answers with pointing",
  "Connect unlimited Macs",
];

export default function PricingPage() {
  return (
    <main className="centered-page">
      <section className="pricing-page-wrap">
        <h1 className="pricing-page-title">
          ${publicEnv.NEXT_PUBLIC_CLICKY_PRICE_MONTHLY}
          <span className="pricing-page-period">/month</span>
        </h1>
        <p className="pricing-page-plan-name">Starter</p>

        <ul className="pricing-page-features">
          {planFeatures.map((planFeature) => (
            <li key={planFeature}>{planFeature}</li>
          ))}
        </ul>

        <PricingActions />

        <p className="pricing-page-footer">
          Already subscribed? <Link href="/dashboard">Open dashboard</Link>.
        </p>
      </section>
    </main>
  );
}
