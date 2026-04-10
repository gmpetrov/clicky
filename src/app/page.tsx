import Link from 'next/link';

import { publicEnv } from '@/lib/public-env';
import { BlueCursorFollower } from '@/components/blue-cursor-follower';

const features = [
  { title: 'Voice in, voice out', detail: 'Push-to-talk. No typing.' },
  { title: 'Screen-aware', detail: 'Sees what you see.' },
  { title: 'Points at things', detail: 'Flies to the right button.' },
  { title: 'Menu bar only', detail: 'No window. No dock icon.' },
];

export default function HomePage() {
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
          <Link
            href="/sign-up?next=/dashboard"
            className="primary-button"
            aria-label="Create your Pointerly account"
            style={{
              background: '#040404',
              boxShadow: '0 16px 40px rgba(17, 17, 17, 0.18)',
              minHeight: '4.9rem',
              padding: '1rem 1.5rem',
              borderRadius: '1.15rem',
            }}
          >
            <span
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.15rem',
                textAlign: 'center',
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
                Get Started Now
              </span>
            </span>
          </Link>
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
