import { MarketingVerticalLanding } from "@/app/(marketing)/components/marketing-vertical-landing";
import { marketingPublicLinks } from "@/lib/marketing/public-links";
import { VERTICAL_LANDINGS } from "@/lib/marketing/vertical-landing";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

export const generateMetadata = () =>
  generateMarketingMetadata("/physiotherapy");

export default async function MarketingPhysiotherapyPage() {
  const [{ staffHref, demoHref }, jsonLd] = await Promise.all([
    marketingPublicLinks(),
    loadMarketingJsonLd("/physiotherapy"),
  ]);

  return (
    <MarketingVerticalLanding
      content={VERTICAL_LANDINGS["/physiotherapy"]}
      staffHref={staffHref}
      demoHref={demoHref}
      jsonLd={jsonLd}
    />
  );
}
