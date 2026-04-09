"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { authClient } from "@/lib/auth-client";

function normalizeUserCodeForSubmission(rawUserCode: string) {
  return rawUserCode.trim().replace(/-/g, "").toUpperCase();
}

function formatUserCodeForDisplay(rawUserCode: string) {
  const normalizedUserCode = normalizeUserCodeForSubmission(rawUserCode).slice(0, 8);

  if (normalizedUserCode.length <= 4) {
    return normalizedUserCode;
  }

  return `${normalizedUserCode.slice(0, 4)}-${normalizedUserCode.slice(4)}`;
}

export default function DevicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [manuallyEnteredUserCode, setManuallyEnteredUserCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formattedUserCodeFromSearchParams = formatUserCodeForDisplay(searchParams.get("user_code") ?? "");
  const userCode = manuallyEnteredUserCode ?? formattedUserCodeFromSearchParams;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const formattedUserCode = normalizeUserCodeForSubmission(userCode);
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
              onChange={(event) => {
                setManuallyEnteredUserCode(formatUserCodeForDisplay(event.target.value));
                setErrorMessage(null);
              }}
              type="text"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="ABCD-1234"
              maxLength={9}
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
