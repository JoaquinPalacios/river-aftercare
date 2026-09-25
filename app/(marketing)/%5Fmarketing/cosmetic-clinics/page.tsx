import { MarketingVerticalLanding } from "@/app/(marketing)/components/marketing-vertical-landing";
import { marketingConfiguredPublicLinks } from "@/lib/marketing/configured-public-links";
import { VERTICAL_LANDINGS } from "@/lib/marketing/vertical-landing";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

export const dynamic = "error";

export const generateMetadata = () =>
  generateMarketingMetadata("/cosmetic-clinics");

export default async function MarketingCosmeticClinicsPage() {
  const { staffHref, demoHref } = marketingConfiguredPublicLinks();
  const jsonLd = await loadMarketingJsonLd("/cosmetic-clinics");

  return (
    <MarketingVerticalLanding
      content={VERTICAL_LANDINGS["/cosmetic-clinics"]}
      staffHref={staffHref}
      demoHref={demoHref}
      jsonLd={jsonLd}
    />
  );
}
