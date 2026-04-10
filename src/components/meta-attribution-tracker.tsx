"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { persistMetaAttribution } from "@/lib/meta-attribution";

export function MetaAttributionTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    persistMetaAttribution(searchParams);
  }, [searchParams]);

  return null;
}
