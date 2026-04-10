import "server-only";

import { Resend } from "resend";

import { serverEnv } from "@/lib/env";

const resendClient = new Resend(serverEnv.RESEND_API_KEY);
const pointerlyAuthEmailSender = "Pointerly <no-reply@re.notifications.pointerly.xyz>";
const pointerlyAuthEmailReplyToAddress = "support@pointerly.xyz";

type PointerlyMagicLinkEmailFlowType = "sign-in" | "sign-up";

type SendPointerlyMagicLinkEmailOptions = {
  emailAddress: string;
  magicLinkURL: string;
  flowType: PointerlyMagicLinkEmailFlowType;
};

function escapeHtml(unsafeValue: string) {
  return unsafeValue
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getMagicLinkEmailContent(flowType: PointerlyMagicLinkEmailFlowType) {
  if (flowType === "sign-up") {
    return {
      subject: "Finish creating your Pointerly account",
      title: "Finish creating your Pointerly account",
      introCopy:
        "Click the secure link below to finish creating your Pointerly account.",
      actionLabel: "Create my account",
    };
  }

  return {
    subject: "Your Pointerly sign-in link",
    title: "Sign in to Pointerly",
    introCopy: "Click the secure link below to sign in to your Pointerly account.",
    actionLabel: "Sign in to Pointerly",
  };
}

export async function sendPointerlyMagicLinkEmail({
  emailAddress,
  magicLinkURL,
  flowType,
}: SendPointerlyMagicLinkEmailOptions) {
  const emailContent = getMagicLinkEmailContent(flowType);
  const escapedMagicLinkURL = escapeHtml(magicLinkURL);

  const { error } = await resendClient.emails.send({
    from: pointerlyAuthEmailSender,
    to: emailAddress,
    replyTo: pointerlyAuthEmailReplyToAddress,
    subject: emailContent.subject,
    text: [
      emailContent.title,
      "",
      emailContent.introCopy,
      "",
      magicLinkURL,
      "",
      "This link expires in 5 minutes and can only be used once.",
      "If you did not request this email, you can safely ignore it.",
    ].join("\n"),
    html: `
      <div style="background:#f4f7fb;padding:32px 16px;font-family:Inter,Helvetica,Arial,sans-serif;color:#10243e;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:24px;padding:40px 32px;box-shadow:0 20px 50px rgba(16,36,62,0.12);">
          <p style="margin:0 0 12px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#5c7a99;">Pointerly</p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#10243e;">${emailContent.title}</h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#425b76;">${emailContent.introCopy}</p>
          <a href="${escapedMagicLinkURL}" style="display:inline-block;background:#1274ff;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 22px;border-radius:999px;">
            ${emailContent.actionLabel}
          </a>
          <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#5c7a99;">
            This link expires in 5 minutes and can only be used once.
          </p>
          <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#5c7a99;">
            If the button does not open, copy and paste this URL into your browser:
          </p>
          <p style="margin:12px 0 0;font-size:14px;line-height:1.6;word-break:break-all;">
            <a href="${escapedMagicLinkURL}" style="color:#1274ff;">${escapedMagicLinkURL}</a>
          </p>
        </div>
      </div>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }
}
