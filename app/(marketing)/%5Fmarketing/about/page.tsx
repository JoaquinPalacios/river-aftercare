import { JsonLd } from "@/app/(marketing)/components/json-ld";
import {
  MarketingRevealGroup,
  MarketingRevealItem,
} from "@/app/(marketing)/components/marketing-experience";
import { MarketingPageHero } from "@/app/(marketing)/components/marketing-page-hero";
import { MarketingPrimaryLink } from "@/app/(marketing)/components/marketing-primary-link";
import { MarketingShell } from "@/app/(marketing)/components/marketing-shell";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { marketingPublicLinks } from "@/lib/marketing/public-links";
import { editorialRevealDelay } from "@/lib/marketing/reveal-timing";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

import styles from "../../marketing.module.css";

export const generateMetadata = () => generateMarketingMetadata("/about");

export default async function MarketingAboutPage() {
  const [{ staffHref }, jsonLd] = await Promise.all([
    marketingPublicLinks(),
    loadMarketingJsonLd("/about"),
  ]);

  return (
    <MarketingShell currentPath="/about" staffHref={staffHref}>
      <JsonLd data={jsonLd} />
      <main>
        <MarketingPageHero
          variant="about"
          eyebrow="About"
          titleId="about-hero"
          title="Aftercare should feel like part of the care."
          intro={`${PRODUCT_NAME} is a patient aftercare platform for clinics and practices. It helps teams publish clear, branded guidance patients can return to after treatment, between appointments and throughout recovery.`}
        />

        <div className={styles.marketingSoft} data-mk-chapter="soft">
          <div className={styles.band}>
            <div className={styles.inner}>
              <section
                className={styles.headingBlock}
                aria-labelledby="about-what"
              >
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <p className={styles.eyebrow}>What it is</p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <h2 id="about-what" className={styles.sectionTitle}>
                      A branded home for the guidance patients need afterwards
                    </h2>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>
                      {PRODUCT_NAME} turns clinic-approved treatment, recovery
                      and home-care instructions into simple web pages that
                      carry the clinic&apos;s identity. Patients open a durable
                      link or QR code and return whenever they need to check the
                      guidance again.
                    </p>
                    <p className={styles.copy}>
                      No patient app. No patient login. No PDF to hunt down.
                    </p>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </section>

              <section
                className={`${styles.headingBlock} ${styles.headingFollow}`}
                aria-labelledby="about-who"
              >
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <p className={styles.eyebrow}>Who it is for</p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <h2 id="about-who" className={styles.sectionTitle}>
                      Built for treatment-based practices
                    </h2>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>
                      {PRODUCT_NAME} is designed for clinics where important
                      guidance continues after the appointment — including
                      dental practices, physiotherapy clinics, chiropractic
                      practices, cosmetic and aesthetic clinics, and other
                      appropriate allied-health settings.
                    </p>
                    <p className={styles.copy}>
                      The language and guidance may differ by profession. The
                      underlying job is the same: help the clinic deliver clear
                      information after the patient leaves.
                    </p>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </section>

              <section
                className={`${styles.headingBlock} ${styles.headingFollow}`}
                aria-labelledby="about-ownership"
              >
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <p className={styles.eyebrow}>Clinic ownership</p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <h2 id="about-ownership" className={styles.sectionTitle}>
                      Your clinic remains responsible for the care
                    </h2>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>
                      {PRODUCT_NAME} provides publishing and content-management
                      technology. The treating clinic remains responsible for
                      the clinical instructions it publishes. Clinic-owned copy
                      and adaptations require appropriate clinical review.
                    </p>
                    <p className={styles.copy}>
                      {PRODUCT_NAME} does not replace the treating clinician.
                    </p>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </section>

              <section
                className={`${styles.headingBlock} ${styles.headingFollow}`}
                aria-labelledby="about-not"
              >
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <p className={styles.eyebrow}>What it is not</p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <h2 id="about-not" className={styles.sectionTitle}>
                      A publishing platform, not a clinical system
                    </h2>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>
                      {PRODUCT_NAME} is not currently live clinical monitoring,
                      a patient CRM, a health record, a messaging platform,
                      emergency care, or personalised diagnosis or treatment.
                    </p>
                    <p className={styles.copy}>
                      This page does not claim certification, regulatory
                      approval, customer counts, or health outcomes. Privacy and
                      Terms drafts are published for legal review and are not
                      yet approved.
                    </p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(3)}>
                    <p className={styles.copy}>
                      <MarketingPrimaryLink href="/contact">
                        Talk to us about a demo
                      </MarketingPrimaryLink>
                    </p>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </section>
            </div>
          </div>
        </div>
      </main>
    </MarketingShell>
  );
}
