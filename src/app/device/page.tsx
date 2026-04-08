"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export default function DevicePage() {
  const router = useRouter();
  const [userCode, setUserCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const formattedUserCode = userCode.trim().replace(/-/g, "").toUpperCase();
    const { data, error } = await authClient.device({
      query: {
        user_code: formattedUserCode,
      },
    });

    setIsSubmitting(false);

    if (error || !data) {
      setErrorMessage(error?.error_description ?? "That code is invalid or expired.");
      return;
    }

    router.push(`/device/approve?user_code=${formattedUserCode}`);
  }

  return (
    <main className="centered-page">
      <section className="auth-panel">
        <h1>Connect your Mac</h1>
        <p className="auth-copy">
          Enter the code shown in the Pointerly menu bar app.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label">
            Device code
            <input
              className="auth-input auth-code-input"
              value={userCode}
              onChange={(event) => setUserCode(event.target.value.toUpperCase())}
              type="text"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="ABCD-1234"
              required
            />
          </label>

          {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

          <button className="primary-button auth-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Checking..." : "Continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
