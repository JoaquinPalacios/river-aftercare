import { MarketingClinicsHub } from "@/app/(marketing)/components/marketing-clinics-hub";
import { marketingConfiguredPublicLinks } from "@/lib/marketing/configured-public-links";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

export const dynamic = "error";

export const generateMetadata = () => generateMarketingMetadata("/clinics");

export default async function MarketingClinicsPage() {
  const { staffHref } = marketingConfiguredPublicLinks();
  const jsonLd = await loadMarketingJsonLd("/clinics");

  return <MarketingClinicsHub staffHref={staffHref} jsonLd={jsonLd} />;
}
