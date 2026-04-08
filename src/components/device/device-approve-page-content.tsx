"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

type DeviceApprovePageContentProps = {
  userCode: string;
};

export function DeviceApprovePageContent({ userCode }: DeviceApprovePageContentProps) {
  const router = useRouter();
  const session = authClient.useSession();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session.isPending) {
      return;
    }

    if (!session.data?.user) {
      router.replace(`/sign-in?next=${encodeURIComponent(`/device/approve?user_code=${userCode}`)}`);
    }
  }, [router, session.data?.user, session.isPending, userCode]);

  async function handleApproval(decision: "approve" | "deny") {
    if (!userCode) {
      setErrorMessage("Missing device code.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const response =
      decision === "approve"
        ? await authClient.device.approve({ userCode })
        : await authClient.device.deny({ userCode });

    setIsProcessing(false);

    if (response.error) {
      setErrorMessage(response.error.error_description ?? "Something went wrong.");
      return;
    }

    router.replace("/dashboard");
  }

  if (session.isPending || !session.data?.user) {
    return (
      <main className="centered-page">
        <section className="auth-panel">
          <h1>Checking session...</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="centered-page">
      <section className="auth-panel">
        <h1>Approve this device?</h1>
        <p className="auth-copy">
          The Clicky desktop app wants to connect to your account.
        </p>

        <div className="device-approval-card">
          <div className="device-approval-row">
            <span>Account</span>
            <strong>{session.data.user.email}</strong>
          </div>
          <div className="device-approval-row">
            <span>Code</span>
            <strong>{userCode || "—"}</strong>
          </div>
        </div>

        {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

        <div className="dual-actions">
          <button className="primary-button auth-button" disabled={isProcessing} onClick={() => handleApproval("approve")} type="button">
            {isProcessing ? "Working..." : "Approve"}
          </button>
          <button className="secondary-button auth-button" disabled={isProcessing} onClick={() => handleApproval("deny")} type="button">
            Deny
          </button>
        </div>
      </section>
    </main>
  );
}
