import { PaymentSuccessPageContent } from "@/components/billing/payment-success-page-content";

type PaymentSuccessPageProps = {
  searchParams: Promise<{
    checkout_session_id?: string | string[];
  }>;
};

export default async function PaymentSuccessPage({
  searchParams,
}: PaymentSuccessPageProps) {
  const resolvedSearchParams = await searchParams;
  const checkoutSessionIdValue = resolvedSearchParams.checkout_session_id;
  const checkoutSessionId = Array.isArray(checkoutSessionIdValue)
    ? checkoutSessionIdValue[0]
    : checkoutSessionIdValue;

  return <PaymentSuccessPageContent checkoutSessionId={checkoutSessionId ?? null} />;
}
