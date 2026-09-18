import Link from "next/link";

import {
  MarketingRevealCard,
  MarketingRevealGroup,
  MarketingRevealHero,
  MarketingRevealItem,
  MarketingRevealPreview,
} from "@/app/(marketing)/components/marketing-experience";
import { MarketingNumberedSteps } from "@/app/(marketing)/components/marketing-numbered-steps";
import { MarketingPatientPreview } from "@/app/(marketing)/components/marketing-patient-preview";
import { MarketingPillars } from "@/app/(marketing)/components/marketing-pillars";
import { MarketingProcess } from "@/app/(marketing)/components/marketing-process";
import { MarketingProductAssembly } from "@/app/(marketing)/components/marketing-product-assembly";
import { MarketingPrimaryAnchor } from "@/app/(marketing)/components/marketing-primary-anchor";
import { MarketingPrimaryLink } from "@/app/(marketing)/components/marketing-primary-link";
import { MarketingProductPreview } from "@/app/(marketing)/components/marketing-product-preview";
import { JsonLd } from "@/app/(marketing)/components/json-ld";
import { MarketingShell } from "@/app/(marketing)/components/marketing-shell";
import { MarketingWave } from "@/app/(marketing)/components/marketing-wave";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { CLINIC_VERTICAL_NAV } from "@/lib/marketing/clinic-verticals";
import { MARKETING_DEMO_PATIENT_THEME_CSS } from "@/lib/marketing/demo-patient-preview";
import { marketingPublicLinks } from "@/lib/marketing/public-links";
import { editorialRevealDelay } from "@/lib/marketing/reveal-timing";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

import styles from "../marketing.module.css";

const MarketingReveal = {
  Card: MarketingRevealCard,
  Group: MarketingRevealGroup,
  Hero: MarketingRevealHero,
  Item: MarketingRevealItem,
  Preview: MarketingRevealPreview,
};

const FRICTION = [
  "Verbal advice is easy to forget once the appointment ends.",
  "Paper is easy to lose, and PDFs can be awkward to reopen on a phone.",
  "Generic handouts can feel disconnected from the clinic that provided the care.",
] as const;

const BRAND_CARDS = [
  {
    key: "riverside",
    className: styles.brandTeal,
    title: "Dental practice",
    copy: "A calm clinical presentation for post-treatment guidance.",
  },
  {
    key: "specialist",
    className: styles.brandNavy,
    title: "Physiotherapy clinic",
    copy: "A clear, approachable presentation for recovery and home-care guidance.",
  },
  {
    key: "family",
    className: styles.brandWarm,
    title: "Cosmetic clinic",
    copy: "A refined presentation for post-treatment aftercare.",
  },
] as const;

export const generateMetadata = () => generateMarketingMetadata("/");

export default async function MarketingHomePage() {
  const [{ demoHref, staffHref }, jsonLd] = await Promise.all([
    marketingPublicLinks(),
    loadMarketingJsonLd("/"),
  ]);

  return (
    <MarketingShell currentPath="/" staffHref={staffHref}>
      <JsonLd data={jsonLd} />
      <style
        dangerouslySetInnerHTML={{ __html: MARKETING_DEMO_PATIENT_THEME_CSS }}
      />
      <main>
        <section
          className={`${styles.hero} ${styles.marketingBase}`}
          aria-labelledby="marketing-hero"
          data-mk-chapter="hero"
        >
          <div className={styles.heroFrame}>
            <MarketingReveal.Hero>
              <div className={`${styles.inner} ${styles.heroLayout}`}>
                <div className={styles.heroTitleBlock}>
                  <MarketingReveal.Item>
                    <p className={`${styles.eyebrow} ${styles.heroEyebrow}`}>
                      Patient aftercare for clinics and practices
                    </p>
                  </MarketingReveal.Item>
                  <MarketingReveal.Item>
                    <h1 id="marketing-hero" className={styles.heroTitle}>
                      Aftercare that still feels like your clinic.
                    </h1>
                  </MarketingReveal.Item>
                </div>
                <div className={styles.heroLower}>
                  <div className={styles.heroSupport}>
                    <MarketingReveal.Item>
                      <p className={`${styles.lede} ${styles.heroBody}`}>
                        Give patients clear, clinic-branded treatment, recovery
                        and home-care guidance they can reopen after the
                        appointment — by link or QR code, with no app or patient
                        login.
                      </p>
                    </MarketingReveal.Item>
                    <MarketingReveal.Item>
                      <div
                        className={`${styles.actions} ${styles.heroActions}`}
                        data-mk-hero-actions=""
                      >
                        <MarketingPrimaryAnchor href={demoHref}>
                          View the dental demo
                        </MarketingPrimaryAnchor>
                        <Link
                          className={`${styles.button} ${styles.secondary}`}
                          href="#how-it-works"
                        >
                          See how it works
                        </Link>
                      </div>
                    </MarketingReveal.Item>
                  </div>
                  <MarketingReveal.Preview>
                    <MarketingProductPreview />
                  </MarketingReveal.Preview>
                </div>
              </div>
            </MarketingReveal.Hero>
          </div>
          <MarketingWave />
        </section>

        <div className={styles.marketingSoft} data-mk-chapter="soft">
          <section className={styles.band} aria-labelledby="problem-heading">
            <div className={styles.inner}>
              <MarketingReveal.Group>
                <MarketingReveal.Item delay={0}>
                  <p className={styles.eyebrow}>The problem</p>
                </MarketingReveal.Item>
                <div className={styles.problemGrid}>
                  <MarketingReveal.Item delay={editorialRevealDelay(1)}>
                    <h2 id="problem-heading" className={styles.problemTitle}>
                      Patients leave with instructions. They don&apos;t always
                      leave with clarity.
                    </h2>
                  </MarketingReveal.Item>
                  <MarketingNumberedSteps items={FRICTION} />
                </div>
              </MarketingReveal.Group>
            </div>
          </section>

          <section className={styles.band} aria-labelledby="product-heading">
            <MarketingReveal.Group>
              <div className={`${styles.inner} ${styles.productGrid}`}>
                <div className={styles.productCopy} data-mk-product-copy="">
                  <MarketingReveal.Item delay={0}>
                    <p className={styles.eyebrow}>The product</p>
                  </MarketingReveal.Item>
                  <MarketingReveal.Item delay={editorialRevealDelay(1)}>
                    <h2 id="product-heading">
                      A branded patient aftercare home that stays available.
                    </h2>
                  </MarketingReveal.Item>
                  <MarketingReveal.Item delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>
                      {PRODUCT_NAME} gives each clinic a simple, branded place
                      for the guidance patients need after treatment or between
                      visits. Patients can return to the same clinic-owned
                      experience without creating an account or installing an
                      app.
                    </p>
                  </MarketingReveal.Item>
                </div>
                <div className={styles.productVisual} data-mk-product-visual="">
                  <MarketingProductAssembly />
                </div>
              </div>
            </MarketingReveal.Group>
          </section>

          <section
            id="how-it-works"
            className={`${styles.band} ${styles.flowSection}`}
            aria-labelledby="how-heading"
          >
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingReveal.Group>
                  <MarketingReveal.Item delay={0}>
                    <p className={styles.eyebrow}>How it works</p>
                  </MarketingReveal.Item>
                  <MarketingReveal.Item delay={editorialRevealDelay(1)}>
                    <h2 id="how-heading" className={styles.sectionTitle}>
                      From clinic-approved guidance to a page patients keep
                    </h2>
                  </MarketingReveal.Item>
                </MarketingReveal.Group>
              </div>
              <MarketingProcess />
            </div>
          </section>

          <section className={styles.band} aria-labelledby="why-heading">
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingReveal.Group>
                  <MarketingReveal.Item delay={0}>
                    <p className={styles.eyebrow}>Why clinics use it</p>
                  </MarketingReveal.Item>
                  <MarketingReveal.Item delay={editorialRevealDelay(1)}>
                    <h2 id="why-heading" className={styles.sectionTitle}>
                      Consistent aftercare, under your clinic&apos;s brand
                    </h2>
                  </MarketingReveal.Item>
                </MarketingReveal.Group>
              </div>
              <MarketingPillars />
            </div>
          </section>

          <section
            className={styles.band}
            aria-labelledby="clinic-types-heading"
          >
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingReveal.Group>
                  <MarketingReveal.Item delay={0}>
                    <p className={styles.eyebrow}>
                      Built for different kinds of care
                    </p>
                  </MarketingReveal.Item>
                  <MarketingReveal.Item delay={editorialRevealDelay(1)}>
                    <h2
                      id="clinic-types-heading"
                      className={styles.sectionTitle}
                    >
                      One aftercare platform. Different clinic workflows.
                    </h2>
                  </MarketingReveal.Item>
                  <MarketingReveal.Item delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>
                      {PRODUCT_NAME} adapts to the language and guidance
                      different treatment-based practices use, while keeping the
                      patient experience clear, branded and easy to revisit.
                    </p>
                  </MarketingReveal.Item>
                </MarketingReveal.Group>
              </div>
              <div
                className={`${styles.clinicTypeGrid} ${styles.headingFollow}`}
              >
                {CLINIC_VERTICAL_NAV.map((item, index) => (
                  <MarketingReveal.Card
                    key={item.path}
                    index={index}
                    className={styles.clinicTypeSlot}
                  >
                    <Link
                      className={styles.clinicTypeCard}
                      href={item.path}
                      data-vertical={item.themeId}
                    >
                      <h3>{item.cardTitle}</h3>
                      <p>{item.cardCopy}</p>
                    </Link>
                  </MarketingReveal.Card>
                ))}
              </div>
              <p className={styles.clinicTypeMore}>
                <Link className={styles.textLink} href="/clinics">
                  Explore all clinic types →
                </Link>
              </p>
            </div>
          </section>
        </div>

        <div className={styles.marketingShowcase} data-mk-chapter="showcase">
          <section className={styles.band} aria-labelledby="brand-heading">
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingReveal.Group>
                  <MarketingReveal.Item delay={0}>
                    <p className={styles.eyebrow}>Brand flexibility</p>
                  </MarketingReveal.Item>
                  <MarketingReveal.Item delay={editorialRevealDelay(1)}>
                    <h2 id="brand-heading" className={styles.sectionTitle}>
                      One platform, many clinic identities
                    </h2>
                  </MarketingReveal.Item>
                  <MarketingReveal.Item delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>
                      {PRODUCT_NAME} keeps the patient experience consistent
                      while giving each clinic room to present guidance in a way
                      that feels recognisably theirs.
                    </p>
                  </MarketingReveal.Item>
                </MarketingReveal.Group>
              </div>
              <div className={`${styles.brandGrid} ${styles.headingFollow}`}>
                {BRAND_CARDS.map((card, index) => (
                  <MarketingReveal.Card
                    key={card.key}
                    index={index}
                    className={styles.brandRevealSlot}
                  >
                    <article
                      className={`${styles.brandCard} ${card.className}`}
                    >
                      <h3>{card.title}</h3>
                      <p>{card.copy}</p>
                    </article>
                  </MarketingReveal.Card>
                ))}
              </div>
            </div>
          </section>

          <section
            id="preview"
            className={styles.band}
            aria-labelledby="preview-heading"
          >
            <MarketingReveal.Group>
              <div className={`${styles.inner} ${styles.previewGrid}`}>
                <div className={styles.previewCopy}>
                  <MarketingReveal.Item delay={0}>
                    <p className={`${styles.eyebrow} ${styles.eyebrowFlow}`}>
                      Clinic preview
                    </p>
                  </MarketingReveal.Item>
                  <MarketingReveal.Item delay={editorialRevealDelay(1)}>
                    <h2 id="preview-heading">
                      See what patients actually receive
                    </h2>
                  </MarketingReveal.Item>
                  <MarketingReveal.Item delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>
                      The Riverside Dental Demo is one live example of the{" "}
                      {PRODUCT_NAME} experience: clinic branding, clear
                      post-treatment guidance and a page patients can return to
                      without an app or login.
                    </p>
                  </MarketingReveal.Item>
                  <MarketingReveal.Item delay={editorialRevealDelay(3)}>
                    <div className={styles.actions}>
                      <MarketingPrimaryAnchor href={demoHref}>
                        Open Riverside Dental Demo
                      </MarketingPrimaryAnchor>
                    </div>
                  </MarketingReveal.Item>
                </div>
                <MarketingReveal.Item delay={editorialRevealDelay(4)} preview>
                  <MarketingPatientPreview />
                </MarketingReveal.Item>
              </div>
            </MarketingReveal.Group>
          </section>
        </div>

        <div className={styles.marketingClosing} data-mk-chapter="closing">
          <section
            id="see-it"
            className={styles.ctaBlock}
            aria-labelledby="closing-heading"
          >
            <MarketingReveal.Group>
              <div className={`${styles.inner} ${styles.closingCta}`}>
                <div className={styles.closingCtaCopy}>
                  <MarketingReveal.Item delay={0}>
                    <p className={styles.eyebrow}>Get started</p>
                    <h2 id="closing-heading">Bring your aftercare online.</h2>
                    <p className={styles.copy}>
                      Tell us how your clinic currently shares treatment,
                      recovery or home-care guidance. We&apos;ll show you how{" "}
                      {PRODUCT_NAME} can bring it online under your
                      clinic&apos;s brand.
                    </p>
                  </MarketingReveal.Item>
                </div>
                <MarketingReveal.Item delay={editorialRevealDelay(1)}>
                  <div className={styles.closingCtaAction}>
                    <MarketingPrimaryLink href="/contact">
                      Request a demo
                    </MarketingPrimaryLink>
                  </div>
                </MarketingReveal.Item>
              </div>
            </MarketingReveal.Group>
          </section>
        </div>
      </main>
    </MarketingShell>
  );
}
