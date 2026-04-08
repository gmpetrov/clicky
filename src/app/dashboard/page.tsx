import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, MonitorSmartphone } from "lucide-react";

import { BillingActions } from "@/components/billing/billing-actions";
import { getBillingSnapshot } from "@/lib/billing";

export default async function DashboardPage() {
  const billingSnapshot = await getBillingSnapshot(await headers());

  if (!billingSnapshot.session) {
    redirect("/sign-in?next=/dashboard");
  }

  const currentUserDisplayName =
    billingSnapshot.session.user.name ?? billingSnapshot.session.user.email;

  const isEntitled = billingSnapshot.isEntitled;
  const planLabel = billingSnapshot.activeSubscription ? "Starter" : "No plan";
  const planStatusLabel = billingSnapshot.activeSubscription?.status ?? "inactive";

  return (
    <main className="dash-main">
      <section className="dash-header">
        <div className="dash-greeting">
          <h1 className="dash-greeting-title">Hi {currentUserDisplayName}.</h1>
          <p className="dash-greeting-subtitle">
            {billingSnapshot.session.user.email}
          </p>
        </div>
        <div className={`dash-status-pill ${isEntitled ? "dash-status-pill-active" : "dash-status-pill-inactive"}`}>
          <span className={`dash-status-dot ${isEntitled ? "dash-status-dot-active" : ""}`} />
          {isEntitled ? "Desktop unlocked" : "Desktop locked"}
        </div>
      </section>

      <section className="dash-cards">
        <div className="dash-card">
          <div className="dash-card-header">
            <div className="dash-card-icon-wrap">
              {isEntitled ? (
                <CheckCircle2 className="dash-card-icon dash-card-icon-active" />
              ) : (
                <Circle className="dash-card-icon" />
              )}
            </div>
            <div className="dash-card-label">Subscription</div>
          </div>
          <div className="dash-card-value">{planLabel}</div>
          <div className="dash-card-detail">
            {isEntitled
              ? `Status: ${planStatusLabel}`
              : "Subscribe to unlock the desktop app."}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-header">
            <div className="dash-card-icon-wrap">
              <MonitorSmartphone className="dash-card-icon" />
            </div>
            <div className="dash-card-label">Device</div>
          </div>
          <div className="dash-card-value">macOS</div>
          <div className="dash-card-detail">
            {isEntitled
              ? "Connected and ready to use."
              : "Approve a device after subscribing."}
          </div>
          <Link href="/device" className="dash-card-link">
            Connect a Mac
          </Link>
        </div>
      </section>

      <section className="dash-checklist">
        <div className="dash-section-label">Access</div>
        <div className="dash-checklist-list">
          <DashChecklistRow
            isActive={!!billingSnapshot.session.session.id}
            label="Signed in"
          />
          <DashChecklistRow
            isActive={isEntitled}
            label="Starter plan active"
          />
          <DashChecklistRow
            isActive={isEntitled}
            label="Worker access granted"
          />
        </div>
      </section>

      <BillingActions
        currentPlanName={planLabel}
        currentSubscriptionStatus={billingSnapshot.activeSubscription?.status ?? null}
        hasActiveSubscription={isEntitled}
      />
    </main>
  );
}

function DashChecklistRow({
  isActive,
  label,
}: {
  isActive: boolean;
  label: string;
}) {
  return (
    <div className="dash-check-row">
      {isActive ? (
        <CheckCircle2 className="dash-check-icon dash-check-icon-active" />
      ) : (
        <Circle className="dash-check-icon" />
      )}
      <span className={isActive ? "dash-check-label-active" : "dash-check-label"}>
        {label}
      </span>
    </div>
  );
}
