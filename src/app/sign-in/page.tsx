import { SignInPageContent } from "@/components/auth/sign-in-page-content";

type SignInPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolvedSearchParams = await searchParams;
  const nextPathValue = resolvedSearchParams.next;
  const callbackURL = Array.isArray(nextPathValue) ? nextPathValue[0] : nextPathValue;

  return <SignInPageContent callbackURL={callbackURL ?? "/dashboard"} />;
}
