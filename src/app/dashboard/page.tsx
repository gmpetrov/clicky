import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Circle, MonitorSmartphone } from 'lucide-react';

import { BillingActions } from '@/components/billing/billing-actions';
import { getBillingSnapshot } from '@/lib/billing';
import { getLatestDesktopAppRelease } from '@/lib/desktop-app-update';

export default async function DashboardPage() {
  const billingSnapshot = await getBillingSnapshot(await headers());

  if (!billingSnapshot.session) {
    redirect('/sign-in?next=/dashboard');
  }

  const currentUserDisplayName =
    billingSnapshot.session.user.name ?? billingSnapshot.session.user.email;

  const isEntitled = billingSnapshot.isEntitled;
  const planLabel = billingSnapshot.activeSubscription ? 'Starter' : 'No plan';
  const planStatusLabel =
    billingSnapshot.activeSubscription?.status ?? 'inactive';
  const latestDesktopAppRelease = getLatestDesktopAppRelease();

  return (
    <main className="dash-main">
      <section className="dash-header">
        <div className="dash-greeting">
          <h1 className="dash-greeting-title">Hi {currentUserDisplayName}.</h1>
          <p className="dash-greeting-subtitle">
            {billingSnapshot.session.user.email}
          </p>
        </div>
        <div
          className={`dash-status-pill ${isEntitled ? 'dash-status-pill-active' : 'dash-status-pill-inactive'}`}
        >
          <span
            className={`dash-status-dot ${isEntitled ? 'dash-status-dot-active' : 'dash-status-dot-inactive'}`}
          />
          {isEntitled ? 'Desktop unlocked' : 'Desktop locked'}
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
              : 'Subscribe to unlock the desktop app.'}
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
              ? 'Download the latest app on your Mac, then connect it from the menu bar if needed.'
              : 'Open this page on your Mac to download the app, then connect it after subscribing.'}
          </div>
          <div className="dash-card-actions">
            <a
              href={latestDesktopAppRelease.downloadURL}
              target="_blank"
              rel="noreferrer"
              className="primary-button dash-card-button items-center gap-2 justify-center inline-flex"
              aria-label={`Download Pointerly for macOS, version ${latestDesktopAppRelease.version}`}
            >
              <span
                aria-hidden="true"
                style={{ display: 'inline-flex', flexShrink: 0 }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  role="presentation"
                  width="25"
                  height="25"
                  style={{ display: 'block' }}
                >
                  <path d="M16.365 12.04c.03 3.244 2.846 4.324 2.877 4.338-.024.076-.45 1.544-1.48 3.063-.89 1.313-1.813 2.621-3.268 2.648-1.43.026-1.89-.848-3.525-.848-1.633 0-2.146.822-3.499.874-1.405.053-2.476-1.412-3.374-2.719-1.836-2.656-3.239-7.508-1.355-10.783.936-1.627 2.61-2.656 4.426-2.682 1.379-.026 2.68.927 3.524.927.842 0 2.425-1.146 4.086-.978.695.029 2.646.281 3.9 2.115-.102.063-2.326 1.356-2.312 4.045Zm-2.79-7.742c.744-.9 1.244-2.15 1.107-3.398-1.07.043-2.364.712-3.133 1.612-.688.794-1.289 2.064-1.127 3.281 1.193.092 2.41-.607 3.153-1.495Z" />
                </svg>
              </span>
              Download for Mac
            </a>
            <Link href="/device" className="dash-card-link">
              Already installed? Connect a Mac
            </Link>
          </div>
        </div>
      </section>

      <section className="dash-checklist">
        <div className="dash-section-label">Access</div>
        <div className="dash-checklist-list">
          <DashChecklistRow
            isActive={!!billingSnapshot.session.session.id}
            label="Signed in"
          />
          <DashChecklistRow isActive={isEntitled} label="Starter plan active" />
          <DashChecklistRow
            isActive={isEntitled}
            label="Worker access granted"
          />
        </div>
      </section>

      <BillingActions
        currentPlanName={planLabel}
        currentSubscriptionStatus={
          billingSnapshot.activeSubscription?.status ?? null
        }
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
      <span
        className={isActive ? 'dash-check-label-active' : 'dash-check-label'}
      >
        {label}
      </span>
    </div>
  );
}
