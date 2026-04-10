import { publicEnv } from "@/lib/public-env";

type MetaPixelUserData = {
  em?: string;
  external_id?: string | number;
  ph?: string;
};

type MetaIdentityOptions = {
  emailAddress?: string;
  externalUserId?: string | number;
  phoneNumber?: string;
};

type MetaCheckoutOptions = MetaIdentityOptions & {
  currency?: string;
  planName?: string;
  value?: number;
};

type MetaPurchaseOptions = MetaIdentityOptions & {
  currency?: string;
  orderId?: string;
  planName?: string;
  transactionId?: string;
  value?: number;
};

type MetaPixelFunction = {
  (
    command: "init",
    pixelId: string,
    userData?: MetaPixelUserData
  ): void;
  (
    command: "track",
    eventName: string,
    eventOptions?: Record<string, unknown>
  ): void;
  getState?: () => {
    pixels?: Array<{
      id?: string;
    }>;
  };
};

declare global {
  interface Window {
    _fbq?: MetaPixelFunction;
    fbq?: MetaPixelFunction;
  }
}

const initializedMetaPixelIds = new Set<string>();

function getMetaPixelId() {
  return publicEnv.NEXT_PUBLIC_META_PIXEL_ID;
}

function isMetaPixelReady() {
  return Boolean(getMetaPixelId()) && typeof window !== "undefined" && Boolean(window.fbq);
}

function getCurrentMetaPixelState() {
  const currentMetaPixelId = getMetaPixelId();
  const pixelState = window.fbq?.getState?.();

  return pixelState?.pixels?.find((pixel) => pixel.id === currentMetaPixelId);
}

function buildMetaUserData(
  identityOptions: MetaIdentityOptions = {},
): MetaPixelUserData {
  const normalizedEmailAddress = identityOptions.emailAddress?.trim().toLowerCase();
  const normalizedPhoneNumber = identityOptions.phoneNumber?.trim();

  return {
    ...(normalizedEmailAddress ? { em: normalizedEmailAddress } : {}),
    ...(identityOptions.externalUserId ? { external_id: identityOptions.externalUserId } : {}),
    ...(normalizedPhoneNumber ? { ph: normalizedPhoneNumber } : {}),
  };
}

function hasObjectKeys(record: Record<string, unknown>) {
  return Object.keys(record).length > 0;
}

function ensureMetaPixelInitialized(
  identityOptions: MetaIdentityOptions = {},
) {
  if (!isMetaPixelReady()) {
    return;
  }

  const currentMetaPixelId = getMetaPixelId();

  if (!currentMetaPixelId) {
    return;
  }

  const metaUserData = buildMetaUserData(identityOptions);
  const currentMetaPixelState = getCurrentMetaPixelState();

  if (currentMetaPixelState) {
    initializedMetaPixelIds.add(currentMetaPixelId);
    return;
  }

  if (!initializedMetaPixelIds.has(currentMetaPixelId)) {
    window.fbq?.(
      "init",
      currentMetaPixelId,
      hasObjectKeys(metaUserData) ? metaUserData : undefined,
    );
    initializedMetaPixelIds.add(currentMetaPixelId);
  }
}

function trackMetaEvent(
  eventName: string,
  eventOptions: Record<string, unknown> = {},
  identityOptions: MetaIdentityOptions = {},
) {
  if (!isMetaPixelReady()) {
    return;
  }

  ensureMetaPixelInitialized(identityOptions);
  const normalizedEventOptions = { ...eventOptions };
  const transactionId = normalizedEventOptions.transaction_id;

  if (
    typeof transactionId === "string" &&
    transactionId.length > 0 &&
    !normalizedEventOptions.order_id
  ) {
    normalizedEventOptions.order_id = transactionId;
  }

  window.fbq?.(
    "track",
    eventName,
    hasObjectKeys(normalizedEventOptions) ? normalizedEventOptions : undefined,
  );
}

export function pageView(identityOptions: MetaIdentityOptions = {}) {
  if (!isMetaPixelReady()) {
    return;
  }

  ensureMetaPixelInitialized(identityOptions);
  window.fbq?.("track", "PageView");
}

export function completeRegistration(
  identityOptions: MetaIdentityOptions = {},
) {
  trackMetaEvent("CompleteRegistration", {}, identityOptions);
}

export function initiateCheckout(
  checkoutOptions: MetaCheckoutOptions = {},
) {
  const {
    currency = "USD",
    planName,
    value,
    ...identityOptions
  } = checkoutOptions;

  const eventOptions: Record<string, unknown> = {
    currency,
  };

  if (planName) {
    eventOptions.content_name = planName;
  }

  if (typeof value === "number") {
    eventOptions.value = value;
  }

  trackMetaEvent("InitiateCheckout", eventOptions, identityOptions);
}

export function purchase(
  purchaseOptions: MetaPurchaseOptions = {},
) {
  const {
    currency = "USD",
    orderId,
    planName,
    transactionId,
    value,
    ...identityOptions
  } = purchaseOptions;

  const eventOptions: Record<string, unknown> = {
    currency,
  };

  if (planName) {
    eventOptions.content_name = planName;
  }

  if (orderId) {
    eventOptions.order_id = orderId;
  }

  if (transactionId) {
    eventOptions.transaction_id = transactionId;
  }

  if (typeof value === "number") {
    eventOptions.value = value;
  }

  trackMetaEvent("Purchase", eventOptions, identityOptions);
}
