"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { publicEnv } from "@/lib/public-env";

type SignInPageContentProps = {
  callbackURL: string;
  initialErrorMessage: string | null;
};

type RequestEmailLinkResponse = {
  errorMessage?: string;
};

export function SignInPageContent({
  callbackURL,
  initialErrorMessage,
}: SignInPageContentProps) {
  const [emailAddress, setEmailAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage,
  );
  const [submittedEmailAddress, setSubmittedEmailAddress] = useState<
    string | null
  >(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const response = await fetch("/api/auth/request-email-link", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: emailAddress,
        callbackURL,
        flowType: "sign-in",
      }),
    });
    const responseBody =
      ((await response.json()) as RequestEmailLinkResponse) ?? {};

    if (!response.ok) {
      setErrorMessage(
        responseBody.errorMessage ?? "Unable to send a sign-in link right now.",
      );
      setIsSubmitting(false);
      return;
    }

    setSubmittedEmailAddress(emailAddress.trim());
    setIsSubmitting(false);
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
        <h1>{submittedEmailAddress ? "Check your email" : "Sign in"}</h1>

        {submittedEmailAddress ? (
          <p className="auth-copy">
            We sent a secure sign-in link to{" "}
            <strong>{submittedEmailAddress}</strong>. Open it on this device to
            finish signing in.
          </p>
        ) : (
          <p className="auth-copy">
            Enter your email and we&apos;ll send you a secure sign-in link.
          </p>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label">
            Email
            <input
              className="auth-input"
              value={emailAddress}
              onChange={(event) => {
                setEmailAddress(event.target.value);
                setErrorMessage(null);
                setSubmittedEmailAddress(null);
              }}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </label>

          {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

          <button
            className="primary-button auth-button"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? "Sending sign-in link..."
              : submittedEmailAddress
                ? "Send another link"
                : "Email me a sign-in link"}
          </button>
        </form>

        {publicEnv.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" ? (
          <>
            <div className="auth-divider">
              <span>or</span>
            </div>
            <button
              className="secondary-button auth-button"
              disabled={isSubmitting}
              onClick={handleGoogleSignIn}
              type="button"
            >
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
