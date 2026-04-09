import { NextResponse } from "next/server";

import { getLatestDesktopAppRelease } from "@/lib/desktop-app-update";

export function GET() {
  return NextResponse.json(getLatestDesktopAppRelease(), {
    headers: {
      "Cache-Control":
        "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
