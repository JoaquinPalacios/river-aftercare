import Link from "next/link";

import { JsonLd } from "@/app/(marketing)/components/json-ld";
import {
  MarketingRevealCard,
  MarketingRevealGroup,
  MarketingRevealItem,
} from "@/app/(marketing)/components/marketing-experience";
import { MarketingNumberedSteps } from "@/app/(marketing)/components/marketing-numbered-steps";
import { MarketingPageHero } from "@/app/(marketing)/components/marketing-page-hero";
import { MarketingPrimaryLink } from "@/app/(marketing)/components/marketing-primary-link";
import { MarketingShell } from "@/app/(marketing)/components/marketing-shell";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  GUIDE_AVAILABILITY_NOTE,
  LAUNCH_PLANS,
  ONBOARDING_STEPS,
  PRICING_GST_LABEL,
  PRICING_NOTES,
  PRICING_TYPOGRAPHY_FEATURE_LABEL,
  PRICING_TYPOGRAPHY_FOOTNOTE_ID,
  PRICING_TYPOGRAPHY_NOTE,
} from "@/lib/marketing/plans";
import { marketingPublicLinks } from "@/lib/marketing/public-links";
import { editorialRevealDelay } from "@/lib/marketing/reveal-timing";
import {
  generateMarketingMetadata,
  loadMarketingJsonLd,
} from "@/lib/seo/marketing-page";

import styles from "../../marketing.module.css";

export const generateMetadata = () => generateMarketingMetadata("/pricing");

export default async function MarketingPricingPage() {
  const [{ staffHref }, jsonLd] = await Promise.all([
    marketingPublicLinks(),
    loadMarketingJsonLd("/pricing"),
  ]);

  return (
    <MarketingShell currentPath="/pricing" staffHref={staffHref}>
      <JsonLd data={jsonLd} />
      <main>
        <MarketingPageHero
          variant="pricing"
          eyebrow="Pricing"
          titleId="pricing-hero"
          title="Simple plans for branded patient aftercare."
          intro={`${PRODUCT_NAME} looks like the clinic, is frictionless for the patient, and needs no patient account or app. Your practice software runs the clinic. ${PRODUCT_NAME} owns the experience after the patient walks out the door.`}
        />

        <div className={styles.marketingSoft} data-mk-chapter="soft">
          <section className={styles.band} aria-labelledby="plans-heading">
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <p className={styles.eyebrow}>Plans</p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <h2 id="plans-heading" className={styles.sectionTitle}>
                      Choose the plan that fits your practice
                    </h2>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>
                      Durable aftercare URLs under the clinic brand, so staff
                      are not left maintaining awkward PDFs and scattered web
                      pages. {PRICING_GST_LABEL}
                    </p>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </div>
              <div className={`${styles.planGrid} ${styles.headingFollow}`}>
                {LAUNCH_PLANS.map((plan, index) => (
                  <MarketingRevealCard
                    key={plan.id}
                    index={index}
                    className={styles.planRevealSlot}
                  >
                    <article
                      className={
                        plan.recommended
                          ? `${styles.planCard} ${styles.planCardRecommended}`
                          : styles.planCard
                      }
                      aria-labelledby={`plan-${plan.id}`}
                    >
                      {plan.recommended ? (
                        <p className={styles.planBadge}>Recommended</p>
                      ) : (
                        <p
                          className={styles.planBadgeSpacer}
                          aria-hidden="true"
                        >
                          &nbsp;
                        </p>
                      )}
                      <h3 id={`plan-${plan.id}`}>{plan.name}</h3>
                      {plan.monthlyPrice ? (
                        <p className={styles.planPrice}>
                          <span className={styles.planAmount}>
                            {plan.monthlyPrice}
                          </span>
                          <span className={styles.planCadence}>
                            {" "}
                            {plan.cadence}
                          </span>
                          <span className={styles.planAnnual}>
                            {plan.annualPrice}/year
                            {plan.annualNote ? ` — ${plan.annualNote}` : null}
                          </span>
                        </p>
                      ) : (
                        <p className={styles.planPrice}>
                          <span className={styles.planAmount}>
                            Custom pricing
                          </span>
                        </p>
                      )}
                      <p className={styles.planPosition}>{plan.position}</p>
                      <ul className={styles.planFeatures}>
                        {plan.features.map((feature) => (
                          <li key={feature}>
                            {feature}
                            {feature === PRICING_TYPOGRAPHY_FEATURE_LABEL ? (
                              <a
                                className={styles.planFootnoteRef}
                                href={`#${PRICING_TYPOGRAPHY_FOOTNOTE_ID}`}
                                aria-describedby={
                                  PRICING_TYPOGRAPHY_FOOTNOTE_ID
                                }
                              >
                                <sup aria-hidden="true">*</sup>
                                <span className={styles.srOnly}>
                                  Typography availability note
                                </span>
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      {plan.setupNotes ? (
                        <div className={styles.planLocations}>
                          {plan.setupNotes.map((note) => (
                            <p key={note} className={styles.planLocationsNote}>
                              {note}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {plan.recommended ? (
                        <MarketingPrimaryLink
                          className={styles.planCta}
                          href={plan.ctaHref}
                        >
                          {plan.ctaLabel}
                        </MarketingPrimaryLink>
                      ) : (
                        <Link
                          className={`${styles.button} ${styles.secondary} ${styles.planCta}`}
                          href={plan.ctaHref}
                        >
                          {plan.ctaLabel}
                        </Link>
                      )}
                    </article>
                  </MarketingRevealCard>
                ))}
              </div>
              <p
                id={PRICING_TYPOGRAPHY_FOOTNOTE_ID}
                className={styles.planFootnote}
                role="note"
              >
                {PRICING_TYPOGRAPHY_NOTE}
              </p>
            </div>
          </section>

          <section
            className={`${styles.band} ${styles.flowSection}`}
            aria-labelledby="onboarding-heading"
          >
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <p className={styles.eyebrow}>Onboarding</p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <h2 id="onboarding-heading" className={styles.sectionTitle}>
                      Start with trusted guidance, then make it yours
                    </h2>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>
                      {PRODUCT_NAME} helps the clinic turn approved aftercare
                      into a durable branded patient experience.
                    </p>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </div>
              <MarketingNumberedSteps
                className={styles.headingFollow}
                items={ONBOARDING_STEPS}
              />
              <p className={`${styles.copy} ${styles.headingFollow}`}>
                {GUIDE_AVAILABILITY_NOTE}
              </p>
            </div>
          </section>
        </div>

        <div className={styles.marketingShowcase} data-mk-chapter="showcase">
          <section className={styles.band} aria-labelledby="notes-heading">
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <p className={styles.eyebrow}>
                      Clear pricing, assisted setup
                    </p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <h2 id="notes-heading" className={styles.sectionTitle}>
                      What these prices include
                    </h2>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </div>
              <div className={`${styles.noteGrid} ${styles.headingFollow}`}>
                {PRICING_NOTES.map((note, index) => (
                  <MarketingRevealCard
                    key={note.title}
                    index={index}
                    className={styles.noteCard}
                  >
                    <h3>{note.title}</h3>
                    <p>{note.body}</p>
                  </MarketingRevealCard>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className={styles.marketingClosing} data-mk-chapter="closing">
          <section
            className={styles.ctaBlock}
            aria-labelledby="pricing-closing"
          >
            <MarketingRevealGroup>
              <div className={`${styles.inner} ${styles.closingCta}`}>
                <div className={styles.closingCtaCopy}>
                  <MarketingRevealItem delay={0}>
                    <p className={styles.eyebrow}>Get started</p>
                    <h2 id="pricing-closing">Tell us about your practice.</h2>
                    <p className={styles.copy}>
                      Tell us how your clinic currently shares aftercare
                      guidance. We&apos;ll walk through branded {PRODUCT_NAME}{" "}
                      pages and what launch looks like for your practice.
                    </p>
                  </MarketingRevealItem>
                </div>
                <MarketingRevealItem delay={editorialRevealDelay(1)}>
                  <div className={styles.closingCtaAction}>
                    <MarketingPrimaryLink href="/contact">
                      Request a demo
                    </MarketingPrimaryLink>
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
