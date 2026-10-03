import { MarketingVerticalLanding } from "@/app/(marketing)/components/marketing-vertical-landing";
import { marketingConfiguredPublicLinks } from "@/lib/marketing/configured-public-links";
import { chiropracticDemoExampleHref } from "@/lib/marketing/shared-demo-links";
import { VERTICAL_LANDINGS } from "@/lib/marketing/vertical-landing";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

export const dynamic = "error";

export const generateMetadata = () =>
  generateMarketingMetadata("/chiropractic");

export default async function MarketingChiropracticPage() {
  const { staffHref, demoHref } = marketingConfiguredPublicLinks();
  const jsonLd = await loadMarketingJsonLd("/chiropractic");

  return (
    <MarketingVerticalLanding
      content={VERTICAL_LANDINGS["/chiropractic"]}
      staffHref={staffHref}
      demoHref={demoHref}
      exampleHref={chiropracticDemoExampleHref()}
      jsonLd={jsonLd}
    />
  );
}
