import { DevicePageContent } from "@/components/device/device-page-content";

type DevicePageProps = {
  searchParams: Promise<{
    user_code?: string | string[];
  }>;
};

export default async function DevicePage({ searchParams }: DevicePageProps) {
  const resolvedSearchParams = await searchParams;
  const userCodeValue = resolvedSearchParams.user_code;
  const initialUserCode = Array.isArray(userCodeValue) ? userCodeValue[0] : userCodeValue;

  return <DevicePageContent initialUserCode={initialUserCode ?? ""} />;
}
