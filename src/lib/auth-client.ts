"use client";

import { stripeClient } from "@better-auth/stripe/client";
import { createAuthClient } from "better-auth/react";
import { deviceAuthorizationClient, magicLinkClient } from "better-auth/client/plugins";

import { publicEnv } from "@/lib/public-env";

const bearerTokenStorageKey = "clicky_bearer_token";

function readStoredBearerToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(bearerTokenStorageKey) ?? "";
}

export function clearStoredBearerToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(bearerTokenStorageKey);
}

export const authClient = createAuthClient({
  baseURL: publicEnv.NEXT_PUBLIC_APP_URL,
  plugins: [
    deviceAuthorizationClient(),
    magicLinkClient(),
    stripeClient({
      subscription: true,
    }),
  ],
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: readStoredBearerToken,
    },
    onSuccess: (context) => {
      const authToken = context.response.headers.get("set-auth-token");
      if (authToken && typeof window !== "undefined") {
        window.localStorage.setItem(bearerTokenStorageKey, authToken);
      }
    },
  },
});
