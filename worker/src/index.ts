/**
 * Pointerly Proxy Worker
 *
 * Proxies requests to OpenRouter, ElevenLabs, and AssemblyAI so the app never
 * ships with raw API keys. Keys are stored as Cloudflare secrets.
 *
 * Routes:
 *   POST /chat  → OpenRouter Chat Completions API (streaming)
 *   POST /tts   → ElevenLabs TTS API
 *   POST /transcribe-token → AssemblyAI temp token API
 */

interface Env {
  OPENROUTER_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_VOICE_ID: string;
  ASSEMBLYAI_API_KEY: string;
  CLICKY_APP_URL: string;
  USAGE_METERING_SECRET: string;
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

type DesktopEntitlementPayload = {
  authenticated?: boolean;
  isEntitled?: boolean;
  user?: {
    id?: string;
  };
};

type DesktopEntitlementResult = {
  errorResponse: Response | null;
  entitlementPayload: DesktopEntitlementPayload | null;
  authorizationHeaderValue: string | null;
};

type OpenRouterUsagePayload = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cached_tokens?: number;
  cost?: number | string;
};

export default {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      if (url.pathname === "/chat") {
        return await handleChat(request, env, ctx);
      }

      if (url.pathname === "/tts") {
        return await handleTTS(request, env, ctx);
      }

      if (url.pathname === "/transcribe-token") {
        return await handleTranscribeToken(request, env);
      }
    } catch (error) {
      console.error(`[${url.pathname}] Unhandled error:`, error);
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleChat(
  request: Request,
  env: Env,
  ctx: WorkerExecutionContext,
): Promise<Response> {
  const entitlementResult = await verifyDesktopEntitlement(request, env);
  if (entitlementResult.errorResponse) {
    return entitlementResult.errorResponse;
  }

  const requestStartedAt = new Date();
  const requestBodyText = await request.text();
  const parsedRequestBody = tryParseJSONRecord(requestBodyText);
  const requestedModel =
    typeof parsedRequestBody?.model === "string" ? parsedRequestBody.model : undefined;
  const requestBodyHash = await sha256Hex(requestBodyText);
  const upstreamRequestBody = JSON.stringify(
    ensureOpenRouterUsageStreaming(parsedRequestBody ?? {}),
  );

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "http-referer": env.CLICKY_APP_URL,
      "x-title": "Pointerly",
    },
    body: upstreamRequestBody,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/chat] OpenRouter API error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  if (response.body) {
    const [clientBody, meteringBody] = response.body.tee();

    ctx.waitUntil(
      recordOpenRouterUsageEvent({
        env,
        userId: entitlementResult.entitlementPayload?.user?.id,
        meteringBody,
        requestedModel,
        requestBodyHash,
        requestStartedAt,
      }),
    );

    return new Response(clientBody, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "text/event-stream",
        "cache-control": "no-cache",
      },
    });
  }

  return new Response(null, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

async function handleTranscribeToken(request: Request, env: Env): Promise<Response> {
  const entitlementResult = await verifyDesktopEntitlement(request, env);
  if (entitlementResult.errorResponse) {
    return entitlementResult.errorResponse;
  }

  const response = await fetch(
    "https://streaming.assemblyai.com/v3/token?expires_in_seconds=480",
    {
      method: "GET",
      headers: {
        authorization: env.ASSEMBLYAI_API_KEY,
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/transcribe-token] AssemblyAI token error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = await response.text();
  return new Response(data, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function handleTTS(
  request: Request,
  env: Env,
  ctx: WorkerExecutionContext,
): Promise<Response> {
  const entitlementResult = await verifyDesktopEntitlement(request, env);
  if (entitlementResult.errorResponse) {
    return entitlementResult.errorResponse;
  }

  const requestStartedAt = new Date();
  const requestBodyText = await request.text();
  const parsedRequestBody = tryParseJSONRecord(requestBodyText);
  const textCharacters = readTextCharacterCount(parsedRequestBody);
  const ttsModel =
    typeof parsedRequestBody?.model_id === "string"
      ? parsedRequestBody.model_id
      : "eleven_flash_v2_5";
  const requestBodyHash = await sha256Hex(requestBodyText);
  const voiceId = env.ELEVENLABS_VOICE_ID;

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: requestBodyText,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/tts] ElevenLabs API error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  ctx.waitUntil(
    postUsageEventToApp(env, {
      userId: entitlementResult.entitlementPayload?.user?.id,
      provider: "elevenlabs",
      operation: "text_to_speech",
      model: ttsModel,
      externalRequestId:
        response.headers.get("request-id") ?? response.headers.get("x-request-id") ?? undefined,
      idempotencyKey:
        response.headers.get("request-id") ??
        `elevenlabs:${entitlementResult.entitlementPayload?.user?.id ?? "unknown"}:${requestBodyHash}`,
      requestStartedAt: requestStartedAt.toISOString(),
      requestCompletedAt: new Date().toISOString(),
      rawUsage: {
        textCharacters,
      },
    }),
  );

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "audio/mpeg",
    },
  });
}

async function verifyDesktopEntitlement(
  request: Request,
  env: Env,
): Promise<DesktopEntitlementResult> {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return {
      errorResponse: new Response(
        JSON.stringify({
          error: "missing_authorization",
          message: "A desktop access token is required before using Pointerly.",
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      ),
      entitlementPayload: null,
      authorizationHeaderValue: null,
    };
  }

  const entitlementResponse = await fetch(`${env.CLICKY_APP_URL}/api/desktop/account`, {
    method: "GET",
    headers: {
      authorization: authorizationHeader,
      accept: "application/json",
    },
  });

  if (entitlementResponse.status === 401) {
    return {
      errorResponse: new Response(
        JSON.stringify({
          error: "invalid_session",
          message: "Your Pointerly session has expired. Please sign in again from the desktop app.",
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      ),
      entitlementPayload: null,
      authorizationHeaderValue: authorizationHeader,
    };
  }

  if (!entitlementResponse.ok) {
    const responseBody = await entitlementResponse.text();
    console.error(
      `[/entitlement] Upstream validation error ${entitlementResponse.status}: ${responseBody}`,
    );

    return {
      errorResponse: new Response(
        JSON.stringify({
          error: "entitlement_lookup_failed",
          message: "Pointerly could not verify your subscription right now.",
        }),
        {
          status: 502,
          headers: { "content-type": "application/json" },
        },
      ),
      entitlementPayload: null,
      authorizationHeaderValue: authorizationHeader,
    };
  }

  const entitlementPayload = (await entitlementResponse.json()) as DesktopEntitlementPayload;

  if (!entitlementPayload.authenticated) {
    return {
      errorResponse: new Response(
        JSON.stringify({
          error: "not_authenticated",
          message: "Please sign in to your Pointerly account before using the desktop app.",
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      ),
      entitlementPayload,
      authorizationHeaderValue: authorizationHeader,
    };
  }

  if (!entitlementPayload.isEntitled) {
    return {
      errorResponse: new Response(
        JSON.stringify({
          error: "subscription_required",
          message: "An active Pointerly Starter subscription is required before using the AI worker.",
        }),
        {
          status: 402,
          headers: { "content-type": "application/json" },
        },
      ),
      entitlementPayload,
      authorizationHeaderValue: authorizationHeader,
    };
  }

  return {
    errorResponse: null,
    entitlementPayload,
    authorizationHeaderValue: authorizationHeader,
  };
}

async function recordOpenRouterUsageEvent(input: {
  env: Env;
  userId?: string;
  meteringBody: ReadableStream<Uint8Array>;
  requestedModel?: string;
  requestBodyHash: string;
  requestStartedAt: Date;
}) {
  const streamingResponseText = await readStreamToString(input.meteringBody);
  const parsedUsage = extractOpenRouterUsage(streamingResponseText);

  if (!parsedUsage.usage && !parsedUsage.externalRequestId) {
    console.warn("[/chat] OpenRouter stream completed without usage payload.");
    return;
  }

  await postUsageEventToApp(input.env, {
    userId: input.userId,
    provider: "openrouter",
    operation: "chat_completion",
    model: input.requestedModel,
    externalRequestId: parsedUsage.externalRequestId,
    idempotencyKey:
      parsedUsage.externalRequestId ??
      `openrouter:${input.userId ?? "unknown"}:${input.requestBodyHash}:${input.requestStartedAt.toISOString()}`,
    requestStartedAt: input.requestStartedAt.toISOString(),
    requestCompletedAt: new Date().toISOString(),
    rawUsage: {
      promptTokens: parsedUsage.usage?.prompt_tokens,
      completionTokens: parsedUsage.usage?.completion_tokens,
      totalTokens: parsedUsage.usage?.total_tokens,
      cachedTokens: parsedUsage.usage?.cached_tokens,
      reportedCostUsd: toOptionalNumber(parsedUsage.usage?.cost),
    },
  });
}

async function postUsageEventToApp(
  env: Env,
  payload: Record<string, unknown> & { userId?: string },
) {
  if (!payload.userId || typeof payload.userId !== "string") {
    console.warn("[usage] Missing user id for metering payload, skipping.");
    return;
  }

  const response = await fetch(`${env.CLICKY_APP_URL}/api/internal/usage-events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-clicky-metering-secret": env.USAGE_METERING_SECRET,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    console.error(`[usage] Failed to persist metering event ${response.status}: ${responseBody}`);
  }
}

function ensureOpenRouterUsageStreaming(requestBody: Record<string, unknown>) {
  const existingStreamOptions =
    typeof requestBody.stream_options === "object" && requestBody.stream_options !== null
      ? (requestBody.stream_options as Record<string, unknown>)
      : {};

  return {
    ...requestBody,
    stream_options: {
      ...existingStreamOptions,
      include_usage: true,
    },
  };
}

function extractOpenRouterUsage(streamingResponseText: string): {
  externalRequestId?: string;
  usage?: OpenRouterUsagePayload;
} {
  let externalRequestId: string | undefined;
  let usage: OpenRouterUsagePayload | undefined;

  for (const line of streamingResponseText.split("\n")) {
    if (!line.startsWith("data: ")) {
      continue;
    }

    const jsonString = line.slice(6).trim();
    if (!jsonString || jsonString === "[DONE]") {
      continue;
    }

    try {
      const payload = JSON.parse(jsonString) as {
        id?: string;
        usage?: OpenRouterUsagePayload;
      };

      if (!externalRequestId && typeof payload.id === "string") {
        externalRequestId = payload.id;
      }

      if (payload.usage) {
        usage = payload.usage;
      }
    } catch (error) {
      console.warn("[/chat] Failed to parse streamed OpenRouter usage chunk:", error);
    }
  }

  return {
    externalRequestId,
    usage,
  };
}

function readTextCharacterCount(requestBody: Record<string, unknown> | null) {
  if (!requestBody) {
    return 0;
  }

  const requestText = requestBody.text;
  if (typeof requestText !== "string") {
    return 0;
  }

  return requestText.length;
}

function tryParseJSONRecord(text: string) {
  try {
    const parsedValue = JSON.parse(text);
    if (typeof parsedValue === "object" && parsedValue !== null) {
      return parsedValue as Record<string, unknown>;
    }
  } catch (error) {
    console.warn("[worker] Failed to parse JSON request body:", error);
  }

  return null;
}

async function readStreamToString(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const textDecoder = new TextDecoder();
  let accumulatedText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    accumulatedText += textDecoder.decode(value, { stream: true });
  }

  accumulatedText += textDecoder.decode();
  return accumulatedText;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return [...new Uint8Array(digest)]
    .map((valuePart) => valuePart.toString(16).padStart(2, "0"))
    .join("");
}

function toOptionalNumber(value: number | string | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);
    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return undefined;
}
