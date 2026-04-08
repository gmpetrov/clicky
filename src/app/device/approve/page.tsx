import { DeviceApprovePageContent } from "@/components/device/device-approve-page-content";

type DeviceApprovePageProps = {
  searchParams: Promise<{
    user_code?: string | string[];
  }>;
};

export default async function DeviceApprovePage({ searchParams }: DeviceApprovePageProps) {
  const resolvedSearchParams = await searchParams;
  const userCodeValue = resolvedSearchParams.user_code;
  const userCode = Array.isArray(userCodeValue) ? userCodeValue[0] : userCodeValue;

  return <DeviceApprovePageContent userCode={userCode?.toUpperCase() ?? ""} />;
}
