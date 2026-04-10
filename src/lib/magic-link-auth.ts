export type MagicLinkFlowType = "sign-in" | "sign-up";

export function buildMagicLinkAuthPageURL(
  pathname: "/sign-in" | "/sign-up",
  callbackURL: string,
) {
  const searchParams = new URLSearchParams({
    next: callbackURL,
  });

  return `${pathname}?${searchParams.toString()}`;
}

export function getMagicLinkErrorMessage(errorCode: string | null | undefined) {
  if (!errorCode) {
    return null;
  }

  switch (errorCode) {
    case "INVALID_TOKEN":
      return "That email link is no longer valid. Request a new one and try again.";
    case "EXPIRED_TOKEN":
      return "That email link has expired. Request a new one and try again.";
    case "ATTEMPTS_EXCEEDED":
      return "That email link has already been used. Request a new one and try again.";
    case "new_user_signup_disabled":
      return "That email link can only be used for an existing account.";
    default:
      return "We could not verify that email link. Request a new one and try again.";
  }
}
