"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { completeRegistration } from "@/lib/meta-pixel";

type SignUpPageContentProps = {
  callbackURL: string;
  initialErrorMessage: string | null;
};

type RequestEmailLinkResponse = {
  errorMessage?: string;
};

export function SignUpPageContent({
  callbackURL,
  initialErrorMessage,
}: SignUpPageContentProps) {
  const [fullName, setFullName] = useState("");
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
        name: fullName,
        email: emailAddress,
        callbackURL,
        flowType: "sign-up",
      }),
    });
    const responseBody =
      ((await response.json()) as RequestEmailLinkResponse) ?? {};

    if (!response.ok) {
      setErrorMessage(
        responseBody.errorMessage ??
          "Unable to send an account creation link right now.",
      );
      setIsSubmitting(false);
      return;
    }

    completeRegistration({
      emailAddress,
    });

    setSubmittedEmailAddress(emailAddress.trim());
    setIsSubmitting(false);
  }

  return (
    <main className="centered-page">
      <section className="auth-panel">
        <h1>{submittedEmailAddress ? "Check your email" : "Create account"}</h1>

        {submittedEmailAddress ? (
          <p className="auth-copy">
            We sent a secure account creation link to{" "}
            <strong>{submittedEmailAddress}</strong>. Open it to finish creating
            your Pointerly account.
          </p>
        ) : (
          <p className="auth-copy">
            Enter your name and email and we&apos;ll send you a secure account
            creation link.
          </p>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label">
            Name
            <input
              className="auth-input"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
                setErrorMessage(null);
                setSubmittedEmailAddress(null);
              }}
              type="text"
              autoComplete="name"
              placeholder="Your name"
              required
            />
          </label>

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
              ? "Sending account link..."
              : submittedEmailAddress
                ? "Send another link"
                : "Email me an account link"}
          </button>
        </form>

        <p className="auth-footer-copy">
          Have an account? <Link href="/sign-in">Sign in</Link>.
        </p>
      </section>
    </main>
  );
}
