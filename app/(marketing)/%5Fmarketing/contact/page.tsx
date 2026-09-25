import { JsonLd } from "@/app/(marketing)/components/json-ld";
import {
  MarketingRevealGroup,
  MarketingRevealItem,
} from "@/app/(marketing)/components/marketing-experience";
import { ContactForm } from "@/app/(marketing)/components/contact-form";
import { MarketingPageHero } from "@/app/(marketing)/components/marketing-page-hero";
import { MarketingShell } from "@/app/(marketing)/components/marketing-shell";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { getTurnstileSiteKey } from "@/lib/marketing/contact-config";
import { marketingConfiguredPublicLinks } from "@/lib/marketing/configured-public-links";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

import styles from "../../marketing.module.css";

export const dynamic = "error";

export const generateMetadata = () => generateMarketingMetadata("/contact");

export default async function MarketingContactPage() {
  const { demoHref, staffHref } = marketingConfiguredPublicLinks();
  const jsonLd = await loadMarketingJsonLd("/contact");

  return (
    <MarketingShell currentPath="/contact" staffHref={staffHref}>
      <JsonLd data={jsonLd} />
      <main>
        <MarketingPageHero
          variant="contact"
          eyebrow="Get started"
          titleId="contact-hero"
          title={`See how ${PRODUCT_NAME} could fit your clinic.`}
          intro={`Tell us about your clinic, the guidance you share today and how you currently deliver it. We'll show you how branded ${PRODUCT_NAME} pages could fit your workflow.`}
        />

        <div className={styles.marketingSoft} data-mk-chapter="soft">
          <section
            className={styles.band}
            aria-labelledby="contact-form-heading"
          >
            <div className={styles.inner}>
              <MarketingRevealGroup>
                <MarketingRevealItem delay={0}>
                  <ContactForm
                    demoHref={demoHref}
                    turnstileSiteKey={getTurnstileSiteKey()}
                  />
                </MarketingRevealItem>
              </MarketingRevealGroup>
            </div>
          </section>
        </div>
      </main>
    </MarketingShell>
  );
}
