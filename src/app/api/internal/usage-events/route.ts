import { NextResponse } from "next/server";

import { ingestWorkerUsageEvent, workerUsageEventSchema } from "@/lib/usage-metering";
import { serverEnv } from "@/lib/env";

export async function POST(request: Request) {
  const providedMeteringSecret = request.headers.get("x-clicky-metering-secret");

  if (providedMeteringSecret !== serverEnv.USAGE_METERING_SECRET) {
    return NextResponse.json(
      {
        error: "invalid_metering_secret",
      },
      {
        status: 401,
      },
    );
  }

  const requestBody = await request.json();
  const usageEventInput = workerUsageEventSchema.parse(requestBody);
  const usageEventResult = await ingestWorkerUsageEvent(usageEventInput);

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
