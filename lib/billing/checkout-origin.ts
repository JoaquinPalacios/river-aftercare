import {
  BILLING_COMPLETE_PATH,
  BILLING_SETUP_PATH,
} from "@/lib/billing/activation-gate";

export function checkoutStaffOrigin(input: {
  host: string;
  forwardedProto: string | null;
}): string {
  const forwarded =
    input.forwardedProto?.split(",")[0]?.trim().toLowerCase() ?? "";
  const protocol =
    forwarded === "https" || forwarded === "http"
      ? forwarded
      : input.host.includes("localhost")
        ? "http"
        : "https";
  return `${protocol}://${input.host}`;
}

export function checkoutReturnUrls(input: {
  host: string;
  forwardedProto: string | null;
}): { successUrl: string; cancelUrl: string } {
  const origin = checkoutStaffOrigin(input);
  return {
    successUrl: `${origin}${BILLING_COMPLETE_PATH}`,
    cancelUrl: `${origin}${BILLING_SETUP_PATH}?checkout=cancelled`,
  };
}

export type CheckoutReturnUrlIssue = "malformed" | "insecure_production";

export function checkoutReturnUrlIssue(
  url: string,
  deployment: "production" | "preview" | "local"
): CheckoutReturnUrlIssue | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "malformed";
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    return "malformed";
  }
  if (deployment !== "production") {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1"
  ) {
    return "insecure_production";
  }
  return null;
}
