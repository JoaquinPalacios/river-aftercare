import { labeledPublicUrl } from "@/lib/tenancy/public-url";
import { getRootDomain } from "@/lib/tenancy/root-domain";
import { publicHostnameLabelForSiteSlug } from "@/lib/tenancy/shared-demo-hostname";

/**
 * Absolute public URL for a ClinicSite.
 * The shared demo publishes on its preferred hostname. Other sites use their slug.
 */
export function clinicPatientSiteUrl(input: {
  requestHost: string;
  clinicSlug: string;
  protocol?: string;
  pathname?: string;
}): string | null {
  return labeledPublicUrl({
    requestHost: input.requestHost,
    rootDomain: getRootDomain(),
    label: publicHostnameLabelForSiteSlug(input.clinicSlug),
    protocol: input.protocol,
    pathname: input.pathname,
  });
}
