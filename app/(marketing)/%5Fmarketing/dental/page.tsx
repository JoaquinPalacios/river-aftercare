import { MarketingVerticalLanding } from "@/app/(marketing)/components/marketing-vertical-landing";
import { marketingConfiguredPublicLinks } from "@/lib/marketing/configured-public-links";
import { dentalDemoGuideHref } from "@/lib/marketing/shared-demo-links";
import { VERTICAL_LANDINGS } from "@/lib/marketing/vertical-landing";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

export const dynamic = "error";

export const generateMetadata = () => generateMarketingMetadata("/dental");

export default async function MarketingDentalPage() {
  const { staffHref, demoHref } = marketingConfiguredPublicLinks();
  const jsonLd = await loadMarketingJsonLd("/dental");

  return (
    <MarketingVerticalLanding
      content={VERTICAL_LANDINGS["/dental"]}
      staffHref={staffHref}
      demoHref={dentalDemoGuideHref(process.env, demoHref)}
      jsonLd={jsonLd}
    />
  );
}
