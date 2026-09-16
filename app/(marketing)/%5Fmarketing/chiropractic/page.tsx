import { MarketingVerticalLanding } from "@/app/(marketing)/components/marketing-vertical-landing";
import { marketingPublicLinks } from "@/lib/marketing/public-links";
import { VERTICAL_LANDINGS } from "@/lib/marketing/vertical-landing";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

export const generateMetadata = () =>
  generateMarketingMetadata("/chiropractic");

export default async function MarketingChiropracticPage() {
  const [{ staffHref, demoHref }, jsonLd] = await Promise.all([
    marketingPublicLinks(),
    loadMarketingJsonLd("/chiropractic"),
  ]);

  return (
    <MarketingVerticalLanding
      content={VERTICAL_LANDINGS["/chiropractic"]}
      staffHref={staffHref}
      demoHref={demoHref}
      jsonLd={jsonLd}
    />
  );
}
