import { SignUpPageContent } from "@/components/auth/sign-up-page-content";
import { getMagicLinkErrorMessage } from "@/lib/magic-link-auth";

type SignUpPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const resolvedSearchParams = await searchParams;
  const errorValue = resolvedSearchParams.error;
  const nextPathValue = resolvedSearchParams.next;
  const errorCode = Array.isArray(errorValue) ? errorValue[0] : errorValue;
  const callbackURL = Array.isArray(nextPathValue) ? nextPathValue[0] : nextPathValue;

  return (
    <SignUpPageContent
      callbackURL={callbackURL ?? "/dashboard"}
      initialErrorMessage={getMagicLinkErrorMessage(errorCode)}
    />
  );
}
