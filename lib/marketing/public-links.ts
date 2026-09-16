import { headers } from "next/headers";

import { DEMO_AFTERCARE_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";
import { apexPublicUrl, labeledPublicUrl } from "@/lib/tenancy/public-url";
import { getRootDomain } from "@/lib/tenancy/root-domain";
import type { MarketingSeoPath } from "@/lib/seo/types";

export type MarketingPublicLinks = {
  demoHref: string;
  staffHref: string;
  homeHref: string;
};

export async function marketingPublicLinks(): Promise<MarketingPublicLinks> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const rootDomain = getRootDomain();
  const localPort = host.includes(":")
    ? host.slice(host.lastIndexOf(":"))
    : host.includes("localhost")
      ? ":3000"
      : "";

  return {
    demoHref:
      labeledPublicUrl({
        requestHost: host,
        rootDomain,
        label: DEMO_AFTERCARE_TENANT_SLUG,
        protocol,
      }) ?? `http://${DEMO_AFTERCARE_TENANT_SLUG}.localhost:3000/`,
    staffHref:
      labeledPublicUrl({
        requestHost: host,
        rootDomain,
        label: "app",
        protocol,
        pathname: "/login",
      }) ?? "http://app.localhost:3000/login",
    homeHref:
      apexPublicUrl({
        requestHost: host,
        rootDomain,
        protocol,
      }) ?? `${protocol}://${rootDomain}${localPort}/`,
  };
}

export function homepageAnchor(path: MarketingSeoPath, hash: string): string {
  return path === "/" ? `#${hash}` : `/#${hash}`;
}
