import { SignUpPageContent } from "@/components/auth/sign-up-page-content";

type SignUpPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const resolvedSearchParams = await searchParams;
  const nextPathValue = resolvedSearchParams.next;
  const callbackURL = Array.isArray(nextPathValue) ? nextPathValue[0] : nextPathValue;

  return <SignUpPageContent callbackURL={callbackURL ?? "/dashboard"} />;
}
