import { SignInPageContent } from "@/components/auth/sign-in-page-content";
import { getMagicLinkErrorMessage } from "@/lib/magic-link-auth";

type SignInPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolvedSearchParams = await searchParams;
  const errorValue = resolvedSearchParams.error;
  const nextPathValue = resolvedSearchParams.next;
  const errorCode = Array.isArray(errorValue) ? errorValue[0] : errorValue;
  const callbackURL = Array.isArray(nextPathValue) ? nextPathValue[0] : nextPathValue;

  return (
    <SignInPageContent
      callbackURL={callbackURL ?? "/dashboard"}
      initialErrorMessage={getMagicLinkErrorMessage(errorCode)}
    />
  );
}
