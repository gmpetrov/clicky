"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { completeRegistration } from "@/lib/meta-pixel";

type SignUpPageContentProps = {
  callbackURL: string;
};

export function SignUpPageContent({ callbackURL }: SignUpPageContentProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await authClient.signUp.email({
      name: fullName,
      email: emailAddress,
      password,
      callbackURL,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message ?? "Unable to create your account right now.");
      return;
    }

    completeRegistration({
      emailAddress,
    });

    router.push(callbackURL);
    router.refresh();
  }

  return (
    <main className="centered-page">
      <section className="auth-panel">
        <h1>Create account</h1>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label">
            Name
            <input
              className="auth-input"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
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
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
            />
          </label>

          {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

          <button className="primary-button auth-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="auth-footer-copy">
          Have an account? <Link href="/sign-in">Sign in</Link>.
        </p>
      </section>
    </main>
  );
}
