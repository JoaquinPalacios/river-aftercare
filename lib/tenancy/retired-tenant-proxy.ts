import { NextResponse } from "next/server";

import { retiredTenantGoneResponse } from "@/lib/aftercare/retired-tenant-http";
import { isRetiredPublicTenantLabel } from "@/lib/clinics/retired-tenant-slug";

/**
 * One unique-index read used so a retired hostname can answer 410 before
 * the patient rewrite. Clinic resolution and location redirects stay outside
 * the proxy.
 */
export async function retiredTenantProxyResponse(
  slug: string
): Promise<NextResponse | null> {
  if (!(await isRetiredPublicTenantLabel(slug))) {
    return null;
  }
  return retiredTenantGoneResponse();
}
