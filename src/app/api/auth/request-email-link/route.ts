import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildMagicLinkAuthPageURL,
  type MagicLinkFlowType,
} from "@/lib/magic-link-auth";

const requestEmailLinkBodySchema = z.object({
  callbackURL: z.string().min(1),
  email: z.string().email(),
  flowType: z.enum(["sign-in", "sign-up"]),
  name: z.string().trim().min(1).optional(),
});

function getEmailLinkConflictMessage(flowType: MagicLinkFlowType) {
  if (flowType === "sign-in") {
    return "No Pointerly account exists for that email address yet.";
  }

  return "A Pointerly account already exists for that email address. Sign in instead.";
}

export async function POST(request: Request) {
  try {
    const requestBody = requestEmailLinkBodySchema.parse(await request.json());
    const normalizedEmailAddress = requestBody.email.trim().toLowerCase();
    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmailAddress,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    });

    if (requestBody.flowType === "sign-in" && !existingUser) {
      return NextResponse.json(
        {
          errorMessage: getEmailLinkConflictMessage("sign-in"),
        },
        {
          status: 404,
        },
      );
    }

    if (requestBody.flowType === "sign-up" && existingUser) {
      return NextResponse.json(
        {
          errorMessage: getEmailLinkConflictMessage("sign-up"),
        },
        {
          status: 409,
        },
      );
    }

    if (requestBody.flowType === "sign-up" && !requestBody.name) {
      return NextResponse.json(
        {
          errorMessage: "Enter your name before requesting an email link.",
        },
        {
          status: 400,
        },
      );
    }

    await auth.api.signInMagicLink({
      body: {
        email: normalizedEmailAddress,
        name: requestBody.name,
        callbackURL: requestBody.callbackURL,
        newUserCallbackURL: requestBody.callbackURL,
        errorCallbackURL: buildMagicLinkAuthPageURL(
          requestBody.flowType === "sign-in" ? "/sign-in" : "/sign-up",
          requestBody.callbackURL,
        ),
        metadata: {
          flowType: requestBody.flowType,
        },
      },
      headers: request.headers,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "We could not send that email link right now.";

    return NextResponse.json(
      {
        errorMessage: message,
      },
      {
        status: 400,
      },
    );
  }
}
