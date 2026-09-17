import { MarketingClinicsHub } from "@/app/(marketing)/components/marketing-clinics-hub";
import { marketingPublicLinks } from "@/lib/marketing/public-links";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

export const generateMetadata = () => generateMarketingMetadata("/clinics");

export default async function MarketingClinicsPage() {
  const [{ staffHref }, jsonLd] = await Promise.all([
    marketingPublicLinks(),
    loadMarketingJsonLd("/clinics"),
  ]);

  return <MarketingClinicsHub staffHref={staffHref} jsonLd={jsonLd} />;
}
