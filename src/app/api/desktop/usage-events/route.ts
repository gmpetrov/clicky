import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { desktopUsageEventSchema, ingestDesktopUsageEvent } from "@/lib/usage-metering";

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json(
      {
        error: "not_authenticated",
      },
      {
        status: 401,
      },
    );
  }

  const requestBody = await request.json();
  const usageEventInput = desktopUsageEventSchema.parse(requestBody);
  const usageEventResult = await ingestDesktopUsageEvent(session.user.id, usageEventInput);

  return NextResponse.json(
    {
      ok: true,
      wasDuplicate: usageEventResult.wasDuplicate,
    },
    {
      status: 202,
    },
  );
}
