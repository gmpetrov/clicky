"use client";

import { authClient } from "@/lib/auth-client";

type SignInWithPasswordOptions = {
  emailAddress: string;
  password: string;
  callbackURL: string;
};

type SignUpWithPasswordOptions = {
  fullName: string;
  emailAddress: string;
  password: string;
  callbackURL: string;
};

// Keep the old password auth client calls available so we can restore the
// original form flow later without reconstructing the Better Auth wiring.
export function signInWithPassword({
  emailAddress,
  password,
  callbackURL,
}: SignInWithPasswordOptions) {
  return authClient.signIn.email({
    email: emailAddress,
    password,
    callbackURL,
  });
}

export function signUpWithPassword({
  fullName,
  emailAddress,
  password,
  callbackURL,
}: SignUpWithPasswordOptions) {
  return authClient.signUp.email({
    name: fullName,
    email: emailAddress,
    password,
    callbackURL,
  });
}
