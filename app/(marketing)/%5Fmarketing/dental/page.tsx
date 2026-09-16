import { MarketingVerticalLanding } from "@/app/(marketing)/components/marketing-vertical-landing";
import { marketingPublicLinks } from "@/lib/marketing/public-links";
import { VERTICAL_LANDINGS } from "@/lib/marketing/vertical-landing";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

export const generateMetadata = () => generateMarketingMetadata("/dental");

export default async function MarketingDentalPage() {
  const [{ staffHref, demoHref }, jsonLd] = await Promise.all([
    marketingPublicLinks(),
    loadMarketingJsonLd("/dental"),
  ]);

  return (
    <MarketingVerticalLanding
      content={VERTICAL_LANDINGS["/dental"]}
      staffHref={staffHref}
      demoHref={demoHref}
      jsonLd={jsonLd}
    />
  );
}
