"use client";

export type MetaAttribution = {
  _fbp?: string;
  _fbc?: string;
  fbclid?: string;
};

type MetaAttributionSearchParams = Pick<URLSearchParams, "get">;

const metaAttributionCookieLifetimeSeconds = 60 * 60 * 24 * 90;

function readCookieValue(cookieName: string) {
  if (typeof document === "undefined") {
    return undefined;
  }

  const encodedCookieName = `${encodeURIComponent(cookieName)}=`;
  const cookieEntries = document.cookie.split("; ");

  for (const cookieEntry of cookieEntries) {
    if (cookieEntry.startsWith(encodedCookieName)) {
      return decodeURIComponent(cookieEntry.slice(encodedCookieName.length));
    }
  }

  return undefined;
}

function isInternetProtocolAddress(hostname: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

function getCookieDomainAttribute() {
  if (typeof window === "undefined") {
    return "";
  }

  const currentHostname = window.location.hostname;

  if (
    currentHostname === "localhost" ||
    isInternetProtocolAddress(currentHostname)
  ) {
    return "";
  }

  const hostnameParts = currentHostname.split(".").filter(Boolean);

  if (hostnameParts.length < 2) {
    return "";
  }

  const rootDomain = hostnameParts.slice(-2).join(".");
  return `; Domain=.${rootDomain}`;
}

function writeCookieValue(cookieName: string, cookieValue: string) {
  if (typeof document === "undefined") {
    return;
  }

  const secureAttribute =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";

  document.cookie = [
    `${encodeURIComponent(cookieName)}=${encodeURIComponent(cookieValue)}`,
    "Path=/",
    `Max-Age=${metaAttributionCookieLifetimeSeconds}`,
    "SameSite=Lax",
    getCookieDomainAttribute(),
    secureAttribute,
  ].join("");
}

export function persistMetaAttribution(
  searchParams: MetaAttributionSearchParams,
) {
  const fbclid = searchParams.get("fbclid");

  if (!fbclid || typeof window === "undefined") {
    return;
  }

  const currentFacebookClickAttribution = readCookieValue("_fbc");
  const nextFacebookClickAttribution = `fb.1.${Date.now()}.${fbclid}`;

  writeCookieValue("fbclid", fbclid);

  if (
    !currentFacebookClickAttribution ||
    !currentFacebookClickAttribution.endsWith(`.${fbclid}`)
  ) {
    writeCookieValue("_fbc", nextFacebookClickAttribution);
  }
}

export function getMetaAttribution(): MetaAttribution {
  return {
    ...(readCookieValue("_fbp") ? { _fbp: readCookieValue("_fbp") } : {}),
    ...(readCookieValue("_fbc") ? { _fbc: readCookieValue("_fbc") } : {}),
    ...(readCookieValue("fbclid") ? { fbclid: readCookieValue("fbclid") } : {}),
  };
}

export function getMetaAttributionStripeMetadata() {
  return Object.fromEntries(
    Object.entries(getMetaAttribution()).filter(([, metaAttributionValue]) => {
      return (
        typeof metaAttributionValue === "string" &&
        metaAttributionValue.trim().length > 0
      );
    }),
  ) as Record<string, string>;
}
