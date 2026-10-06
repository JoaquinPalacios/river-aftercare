import { NextResponse } from "next/server";

export const RETIRED_TENANT_MESSAGE =
  "This aftercare page is no longer available.";

/** First release: do not cache a retired hostname across tests or migration. */
export const RETIRED_TENANT_CACHE_CONTROL = "private, no-store";

export function retiredTenantGoneResponse(): NextResponse {
  return new NextResponse(RETIRED_TENANT_MESSAGE, {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": RETIRED_TENANT_CACHE_CONTROL,
      "X-Robots-Tag": "noindex",
    },
  });
}
