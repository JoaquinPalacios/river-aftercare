import { JsonLd } from "@/app/(marketing)/components/json-ld";
import { MarketingLegalDocument } from "@/app/(marketing)/components/marketing-legal-document";
import { MarketingShell } from "@/app/(marketing)/components/marketing-shell";
import { PRIVACY_DOCUMENT } from "@/lib/legal/privacy";
import { marketingConfiguredPublicLinks } from "@/lib/marketing/configured-public-links";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

export const dynamic = "error";

export const generateMetadata = () => generateMarketingMetadata("/privacy");

export default async function MarketingPrivacyPage() {
  const { staffHref } = marketingConfiguredPublicLinks();
  const jsonLd = await loadMarketingJsonLd("/privacy");

  return (
    <MarketingShell currentPath="/privacy" staffHref={staffHref}>
      <JsonLd data={jsonLd} />
      <main>
        <MarketingLegalDocument document={PRIVACY_DOCUMENT} />
      </main>
    </MarketingShell>
  );
}
