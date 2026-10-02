import "server-only";

import { headers } from "next/headers";

import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";

export async function readOperatorRequestHost(): Promise<{
  host: string;
  protocol: string;
}> {
  try {
    const requestHeaders = await headers();
    const host =
      requestHeaders.get("x-forwarded-host") ??
      requestHeaders.get("host") ??
      "";
    const protocol =
      requestHeaders.get("x-forwarded-proto") ??
      (host.includes("localhost") ? "http" : "https");
    return { host, protocol };
  } catch {
    return { host: "", protocol: "http" };
  }
}

export async function designatedDemoPublicUrl(
  adoption: {
    clinicSlug: string;
    publicSlug: string | null;
  } | null
): Promise<string | null> {
  if (!adoption?.publicSlug) {
    return null;
  }
  const request = await readOperatorRequestHost();
  if (!request.host) {
    return null;
  }
  return clinicPatientSiteUrl({
    requestHost: request.host,
    clinicSlug: adoption.clinicSlug,
    protocol: request.protocol,
    pathname: `/${adoption.publicSlug}`,
  });
}
