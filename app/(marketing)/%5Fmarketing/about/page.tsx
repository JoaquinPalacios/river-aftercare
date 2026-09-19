import Link from "next/link";

import { JsonLd } from "@/app/(marketing)/components/json-ld";
import {
  MarketingRevealGroup,
  MarketingRevealItem,
} from "@/app/(marketing)/components/marketing-experience";
import { MarketingPageHero } from "@/app/(marketing)/components/marketing-page-hero";
import { MarketingPrimaryLink } from "@/app/(marketing)/components/marketing-primary-link";
import { MarketingShell } from "@/app/(marketing)/components/marketing-shell";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { CLINIC_VERTICAL_NAV } from "@/lib/marketing/clinic-verticals";
import { marketingPublicLinks } from "@/lib/marketing/public-links";
import { editorialRevealDelay } from "@/lib/marketing/reveal-timing";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

import styles from "../../marketing.module.css";

export const generateMetadata = () => generateMarketingMetadata("/about");

const VALUE_POINTS = [
  "No patient app",
  "No patient login",
  "No PDF to hunt down",
] as const;

const OWNERSHIP_POINTS = [
  {
    label: PRODUCT_NAME,
    body: "Publishing & content-management technology",
  },
  {
    label: "Your clinic",
    body: "Approves and owns clinical instructions",
  },
  {
    label: "Treating clinician",
    body: "Remains responsible for care",
  },
] as const;

const SCOPE_EXCLUSIONS = [
  "Live clinical monitoring",
  "Patient CRM",
  "Health record",
  "Messaging platform",
  "Emergency care",
  "Personalised diagnosis or treatment",
] as const;

const WHO_COPY = [
  `${PRODUCT_NAME} is built for clinics where care continues after the appointment — including dental, physiotherapy, chiropractic, cosmetic and other appropriate allied-health settings.`,
  "The language and guidance may differ by profession. The job is the same: give patients clear, clinic-branded information they can return to after they leave.",
] as const;

const SCOPE_COPY = `${PRODUCT_NAME} is built to publish clear, clinic-approved guidance patients can return to after care. It complements clinical systems rather than replacing them.`;

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
                className={styles.aboutEditorial}
                aria-labelledby="about-what"
              >
                <MarketingRevealGroup>
                  <div className={`${styles.aboutCopy} ${styles.sectionStack}`}>
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
                        carry the clinic&apos;s identity. Patients open a
                        durable link or QR code and return whenever they need to
                        check the guidance again.
                      </p>
                    </MarketingRevealItem>
                  </div>
                  <MarketingRevealItem delay={editorialRevealDelay(2)}>
                    <ul className={styles.aboutValuePanel}>
                      {VALUE_POINTS.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </section>

              <section
                className={`${styles.aboutEditorial} ${styles.aboutWho}`}
                aria-labelledby="about-who"
              >
                <MarketingRevealGroup>
                  <div className={`${styles.aboutCopy} ${styles.sectionStack}`}>
                    <MarketingRevealItem delay={0}>
                      <p className={styles.eyebrow}>Who it is for</p>
                    </MarketingRevealItem>
                    <MarketingRevealItem delay={editorialRevealDelay(1)}>
                      <h2 id="about-who" className={styles.sectionTitle}>
                        Built for treatment-based practices
                      </h2>
                    </MarketingRevealItem>
                    <MarketingRevealItem delay={editorialRevealDelay(2)}>
                      <p className={styles.copy}>{WHO_COPY[0]}</p>
                      <p className={styles.copy}>{WHO_COPY[1]}</p>
                    </MarketingRevealItem>
                  </div>
                  <MarketingRevealItem
                    className={styles.aboutClinicModule}
                    delay={editorialRevealDelay(2)}
                  >
                    <nav aria-label="Clinic types">
                      <ul className={styles.aboutClinicList}>
                        {CLINIC_VERTICAL_NAV.map((item) => (
                          <li key={item.path}>
                            <Link
                              className={styles.aboutClinicLink}
                              href={item.path}
                              data-vertical={item.themeId}
                            >
                              {item.navLabel}
                            </Link>
                          </li>
                        ))}
                        <li>
                          <span className={styles.aboutClinicMuted}>
                            Other appropriate allied health
                          </span>
                        </li>
                      </ul>
                    </nav>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </section>
            </div>
          </div>
        </div>

        <section
          className={styles.aboutOwnership}
          aria-labelledby="about-ownership"
        >
          <div className={styles.inner}>
            <MarketingRevealGroup>
              <div className={styles.aboutOwnershipGrid}>
                <div className={`${styles.aboutCopy} ${styles.sectionStack}`}>
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
                </div>
                <MarketingRevealItem delay={editorialRevealDelay(2)}>
                  <ul className={styles.aboutResponsibility}>
                    {OWNERSHIP_POINTS.map((point) => (
                      <li key={point.label}>
                        <p className={styles.aboutResponsibilityLabel}>
                          {point.label}
                        </p>
                        <p className={styles.aboutResponsibilityBody}>
                          {point.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                </MarketingRevealItem>
              </div>
            </MarketingRevealGroup>
          </div>
        </section>

        <div className={styles.marketingSoft} data-mk-chapter="soft">
          <div className={styles.band}>
            <div className={styles.inner}>
              <section
                className={styles.aboutScope}
                aria-labelledby="about-scope"
              >
                <MarketingRevealGroup>
                  <div className={styles.aboutEditorial}>
                    <div
                      className={`${styles.aboutCopy} ${styles.sectionStack}`}
                    >
                      <MarketingRevealItem delay={0}>
                        <p className={styles.eyebrow}>Product scope</p>
                      </MarketingRevealItem>
                      <MarketingRevealItem delay={editorialRevealDelay(1)}>
                        <h2 id="about-scope" className={styles.sectionTitle}>
                          Focused on aftercare publishing.
                        </h2>
                      </MarketingRevealItem>
                      <MarketingRevealItem delay={editorialRevealDelay(2)}>
                        <p className={styles.copy}>{SCOPE_COPY}</p>
                      </MarketingRevealItem>
                    </div>
                    <MarketingRevealItem delay={editorialRevealDelay(2)}>
                      <div className={styles.aboutScopePanel}>
                        <p className={styles.aboutScopeLabel}>
                          Not a replacement for
                        </p>
                        <ul className={styles.aboutScopeGrid}>
                          {SCOPE_EXCLUSIONS.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </MarketingRevealItem>
                  </div>
                </MarketingRevealGroup>
              </section>
            </div>
          </div>
        </div>

        <div className={styles.marketingClosing} data-mk-chapter="closing">
          <section
            className={`${styles.ctaBlock} ${styles.verticalCtaBlock}`}
            aria-labelledby="about-cta"
          >
            <MarketingRevealGroup>
              <div className={`${styles.inner} ${styles.closingCta}`}>
                <div className={styles.closingCtaCopy}>
                  <MarketingRevealItem delay={0}>
                    <h2 id="about-cta">
                      Want to see how {PRODUCT_NAME} could fit your clinic?
                    </h2>
                  </MarketingRevealItem>
                </div>
                <MarketingRevealItem delay={editorialRevealDelay(1)}>
                  <div className={styles.verticalCtaActions}>
                    <MarketingPrimaryLink href="/contact">
                      Request a demo
                    </MarketingPrimaryLink>
                    <Link
                      className={`${styles.textLink} ${styles.verticalCtaSecondary}`}
                      href="/pricing"
                    >
                      View pricing
                    </Link>
                  </div>
                </MarketingRevealItem>
              </div>
            </MarketingRevealGroup>
          </section>
        </div>
      </main>
    </MarketingShell>
  );
}
