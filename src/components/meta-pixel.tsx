"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { pageView } from "@/lib/meta-pixel";

type MetaPixelProps = {
  pixelId: string;
};

export function MetaPixel({ pixelId }: MetaPixelProps) {
  const authSession = authClient.useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hasLoadedMetaPixelScript, setHasLoadedMetaPixelScript] = useState(false);
  const lastTrackedPageIdentifierRef = useRef<string | null>(null);

  useEffect(() => {
    if (authSession.isPending || !hasLoadedMetaPixelScript) {
      return;
    }

    const searchParameterString = searchParams.toString();
    const currentPageIdentifier = searchParameterString
      ? `${pathname}?${searchParameterString}`
      : pathname;

    if (lastTrackedPageIdentifierRef.current === currentPageIdentifier) {
      return;
    }

    lastTrackedPageIdentifierRef.current = currentPageIdentifier;

    pageView({
      emailAddress: authSession.data?.user?.email,
      externalUserId: authSession.data?.user?.id,
    });
  }, [
    authSession.data?.user?.email,
    authSession.data?.user?.id,
    authSession.isPending,
    hasLoadedMetaPixelScript,
    pathname,
    searchParams,
  ]);

  if (!pixelId) {
    return null;
  }

  return (
    <Script
      id="meta-pixel"
      src="/scripts/meta-pixel.js"
      strategy="afterInteractive"
      onLoad={() => setHasLoadedMetaPixelScript(true)}
    />
  );
}
