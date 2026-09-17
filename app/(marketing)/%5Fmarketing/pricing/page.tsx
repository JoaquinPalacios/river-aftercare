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
  COMING_AFTER_LAUNCH,
  GUIDE_AVAILABILITY_NOTE,
  LAUNCH_PLANS,
  PRICING_NOTES,
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
          intro={`${PRODUCT_NAME} gives clinics and practices a branded place for the guidance patients need after treatment or between visits. The pricing below is working Australian pricing and remains provisional until commercial terms are finalised.`}
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
                      <p className={styles.planPrice}>
                        <span className={styles.planAmount}>{plan.price}</span>
                        {plan.cadence ? (
                          <span className={styles.planCadence}>
                            {" "}
                            {plan.cadence}
                          </span>
                        ) : null}
                      </p>
                      <p className={styles.planPosition}>{plan.position}</p>
                      <ul className={styles.planFeatures}>
                        {plan.features.map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                      </ul>
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
            </div>
          </section>

          <section className={styles.band} aria-labelledby="onboarding-heading">
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <p className={styles.eyebrow}>Onboarding</p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <h2 id="onboarding-heading" className={styles.sectionTitle}>
                      Start with approved guidance, then make it yours
                    </h2>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>
                      Launch is assisted. We identify the guidance your clinic
                      wants to publish, use an available {PRODUCT_NAME} template
                      where appropriate, add clinic-approved local instructions
                      and publish the result under your brand.
                    </p>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </div>
              <MarketingNumberedSteps
                className={styles.headingFollow}
                items={[
                  `Choose or prepare the guidance your clinic needs. Where a ${PRODUCT_NAME} template exists, it can be used as a starting point.`,
                  "Adapt the guide with clinic-approved wording, section overrides and local instructions.",
                  "Publish a durable, branded page patients can reopen after the appointment.",
                ]}
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
                    <p className={styles.eyebrow}>Commercial notes</p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <h2 id="notes-heading" className={styles.sectionTitle}>
                      What these prices do and do not include
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

          <section className={styles.band} aria-labelledby="later-heading">
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <p className={styles.eyebrow}>Coming after launch</p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <h2 id="later-heading" className={styles.sectionTitle}>
                      Planned, not in active plans
                    </h2>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>
                      Check-ins are a future premium or add-on capability. They
                      are not part of launch pricing, and no check-in price is
                      published yet.
                    </p>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </div>
              <ul className={`${styles.laterList} ${styles.headingFollow}`}>
                {COMING_AFTER_LAUNCH.map((item, index) => (
                  <MarketingRevealCard
                    key={item}
                    as="li"
                    index={index}
                    className={styles.laterItem}
                  >
                    {item}
                  </MarketingRevealCard>
                ))}
              </ul>
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
