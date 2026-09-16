import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isClinicBrandingPublicPath } from "@/lib/clinic-assets/clinic-logo";
import { parseHostname } from "@/lib/tenancy/parse-hostname";
import {
  isInternalAppPath,
  isMarketingCrawlPath,
  isStaffPath,
  marketingRewritePath,
  normalizePathname,
} from "@/lib/tenancy/paths";
import { getRootDomain } from "@/lib/tenancy/root-domain";

const SPOOFABLE_TENANT_HEADERS = ["x-care-guide-tenant", "x-tenant"] as const;

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

function stripSpoofableHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const header of SPOOFABLE_TENANT_HEADERS) {
    headers.delete(header);
  }
  return headers;
}

function continueWithoutSpoofedHeaders(request: NextRequest): NextResponse {
  return NextResponse.next({
    request: {
      headers: stripSpoofableHeaders(request),
    },
  });
}

export function proxy(request: NextRequest): NextResponse {
  const pathname = normalizePathname(request.nextUrl.pathname);

  if (isInternalAppPath(pathname)) {
    return notFound();
  }

  const classification = parseHostname(
    request.headers.get("host"),
    getRootDomain()
  );

  if (classification.kind === "invalid") {
    return notFound();
  }

  if (classification.kind === "reserved") {
    if (
      classification.label === "assets" &&
      isClinicBrandingPublicPath(pathname)
    ) {
      return continueWithoutSpoofedHeaders(request);
    }
    return notFound();
  }

  if (classification.kind === "staff") {
    return continueWithoutSpoofedHeaders(request);
  }

  if (classification.kind === "marketing") {
    if (isMarketingCrawlPath(pathname)) {
      return continueWithoutSpoofedHeaders(request);
    }

    const rewrittenPath = marketingRewritePath(pathname);
    if (!rewrittenPath) {
      return notFound();
    }

    const url = request.nextUrl.clone();
    url.pathname = rewrittenPath;

    return NextResponse.rewrite(url, {
      request: {
        headers: stripSpoofableHeaders(request),
      },
    });
  }

  if (isStaffPath(pathname)) {
    return notFound();
  }

  const url = request.nextUrl.clone();
  url.pathname =
    pathname === "/"
      ? `/_sites/${classification.slug}`
      : `/_sites/${classification.slug}${pathname}`;

  return NextResponse.rewrite(url, {
    request: {
      headers: stripSpoofableHeaders(request),
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
