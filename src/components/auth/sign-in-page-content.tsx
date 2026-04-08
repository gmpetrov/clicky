"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { publicEnv } from "@/lib/public-env";

type SignInPageContentProps = {
  callbackURL: string;
};

export function SignInPageContent({ callbackURL }: SignInPageContentProps) {
  const router = useRouter();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await authClient.signIn.email({
      email: emailAddress,
      password,
      callbackURL,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message ?? "Unable to sign in right now.");
      return;
    }

    router.push(callbackURL);
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      errorCallbackURL: "/sign-in",
    });

    if (error) {
      setErrorMessage(error.message ?? "Unable to start Google sign-in.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="centered-page">
      <section className="auth-panel">
        <h1>Sign in</h1>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label">
            Email
            <input
              className="auth-input"
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="auth-label">
            Password
            <input
              className="auth-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </label>

          {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

          <button className="primary-button auth-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {publicEnv.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" ? (
          <>
            <div className="auth-divider">
              <span>or</span>
            </div>
            <button className="secondary-button auth-button" disabled={isSubmitting} onClick={handleGoogleSignIn} type="button">
              Continue with Google
            </button>
          </>
        ) : null}

        <p className="auth-footer-copy">
          No account? <Link href="/sign-up">Create one</Link>.
        </p>
      </section>
    </main>
  );
}
