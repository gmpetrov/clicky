import Link from 'next/link';

import { publicEnv } from '@/lib/public-env';
import { BlueCursorFollower } from '@/components/blue-cursor-follower';
import { getLatestDesktopAppRelease } from '@/lib/desktop-app-update';

const features = [
  { title: 'Voice in, voice out', detail: 'Push-to-talk. No typing.' },
  { title: 'Screen-aware', detail: 'Sees what you see.' },
  { title: 'Points at things', detail: 'Flies to the right button.' },
  { title: 'Menu bar only', detail: 'No window. No dock icon.' },
];

export default function HomePage() {
  const latestDesktopAppRelease = getLatestDesktopAppRelease();

  return (
    <main className="landing-main">
      <BlueCursorFollower />

      <section className="landing-hero">
        <h1 className="landing-headline">
          The AI that helps you find stuff
          <br />
          on your screen.
        </h1>
        <p className="landing-subtitle">
          Hold a shortcut, ask out loud. Pointerly sees your screen, answers
          with voice, and points at the exact control you need.
        </p>
        <div className="landing-cta-row">
          <a
            href={latestDesktopAppRelease.downloadURL}
            target="_blank"
            rel="noreferrer"
            className="primary-button"
            aria-label={`Download Pointerly for macOS, version ${latestDesktopAppRelease.version}`}
            style={{
              background: '#040404',
              boxShadow: '0 16px 40px rgba(17, 17, 17, 0.18)',
              minHeight: '4.9rem',
              padding: '1rem 1.5rem',
              borderRadius: '1.15rem',
              gap: '1rem',
            }}
          >
            <span
              aria-hidden="true"
              style={{ display: 'inline-flex', flexShrink: 0 }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                role="presentation"
                width="28"
                height="28"
                style={{ display: 'block' }}
              >
                <path d="M16.365 12.04c.03 3.244 2.846 4.324 2.877 4.338-.024.076-.45 1.544-1.48 3.063-.89 1.313-1.813 2.621-3.268 2.648-1.43.026-1.89-.848-3.525-.848-1.633 0-2.146.822-3.499.874-1.405.053-2.476-1.412-3.374-2.719-1.836-2.656-3.239-7.508-1.355-10.783.936-1.627 2.61-2.656 4.426-2.682 1.379-.026 2.68.927 3.524.927.842 0 2.425-1.146 4.086-.978.695.029 2.646.281 3.9 2.115-.102.063-2.326 1.356-2.312 4.045Zm-2.79-7.742c.744-.9 1.244-2.15 1.107-3.398-1.07.043-2.364.712-3.133 1.612-.688.794-1.289 2.064-1.127 3.281 1.193.092 2.41-.607 3.153-1.495Z" />
              </svg>
            </span>
            <span
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '0.15rem',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display), sans-serif',
                  lineHeight: 1,
                  letterSpacing: '-0.04em',
                }}
                className="text-xl"
              >
                Download for mac
              </span>
              {/* <span
                style={{
                  fontSize: "0.86rem",
                  lineHeight: 1.3,
                  color: "rgba(255, 255, 255, 0.68)",
                }}
              >
                Latest version {latestDesktopAppRelease.version}
              </span> */}
            </span>
          </a>
        </div>
      </section>

      <section className="landing-video w-full">
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '720px',
            margin: '0 auto',
            aspectRatio: '16 / 9',
            borderRadius: '1rem',
            overflow: 'hidden',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
          }}
        >
          <iframe
            src="https://www.youtube.com/embed/Sn8TcvnVnFo"
            title="Pointerly demo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
        </div>
      </section>

      <section className="landing-features">
        {features.map((feature) => (
          <div key={feature.title} className="landing-feature-item">
            <span className="landing-feature-title">{feature.title}</span>
            <span className="landing-feature-detail">{feature.detail}</span>
          </div>
        ))}
      </section>

      <section className="landing-bottom">
        <div className="landing-bottom-inner">
          <div className="landing-plan-badge">Starter</div>
          <div className="landing-plan-price">
            ${publicEnv.NEXT_PUBLIC_CLICKY_PRICE_MONTHLY}
            <span>/month</span>
          </div>
          <p className="landing-plan-copy">
            One plan. Sign in, approve the desktop app, use the assistant.
          </p>
          <Link href="/pricing" className="primary-button landing-plan-cta">
            Subscribe
          </Link>
        </div>
      </section>
    </main>
  );
}
