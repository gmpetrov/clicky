import Link from "next/link";

import { publicEnv } from "@/lib/public-env";
import { BlueCursorFollower } from "@/components/blue-cursor-follower";

const features = [
  { title: "Voice in, voice out", detail: "Push-to-talk. No typing." },
  { title: "Screen-aware", detail: "Sees what you see." },
  { title: "Points at things", detail: "Flies to the right button." },
  { title: "Menu bar only", detail: "No window. No dock icon." },
];

export default function HomePage() {
  return (
    <main className="landing-main">
      <BlueCursorFollower />

      <section className="landing-hero">
        <h1 className="landing-headline">
          Voice help beside
          <br />
          your cursor.
        </h1>
        <p className="landing-subtitle">
          Hold a shortcut, ask out loud. Pointerly sees your screen, answers with voice,
          and points at the exact control you need.
        </p>
        <div className="landing-cta-row">
          <Link href="/sign-up" className="primary-button">
            Start for ${publicEnv.NEXT_PUBLIC_CLICKY_PRICE_MONTHLY}/mo
          </Link>
          <Link href="/dashboard" className="secondary-button">
            Dashboard
          </Link>
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
