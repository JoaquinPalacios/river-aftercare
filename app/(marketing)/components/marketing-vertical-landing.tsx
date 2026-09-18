import Link from "next/link";

import {
  MarketingRevealCard,
  MarketingRevealGroup,
  MarketingRevealItem,
} from "@/app/(marketing)/components/marketing-experience";
import { MarketingFaq } from "@/app/(marketing)/components/marketing-faq";
import { MarketingPrimaryAnchor } from "@/app/(marketing)/components/marketing-primary-anchor";
import { MarketingPrimaryLink } from "@/app/(marketing)/components/marketing-primary-link";
import { MarketingShell } from "@/app/(marketing)/components/marketing-shell";
import {
  MarketingVerticalHero,
  verticalHeroSecondary,
} from "@/app/(marketing)/components/marketing-vertical-hero";
import { JsonLd } from "@/app/(marketing)/components/json-ld";
import { editorialRevealDelay } from "@/lib/marketing/reveal-timing";
import type { VerticalLandingContent } from "@/lib/marketing/vertical-landing";
import type { JsonLdGraph } from "@/lib/seo/json-ld";

import styles from "../marketing.module.css";

export function MarketingVerticalLanding({
  content,
  staffHref,
  demoHref,
  jsonLd,
}: {
  content: VerticalLandingContent;
  staffHref: string;
  demoHref: string;
  jsonLd: JsonLdGraph;
}) {
  const id = content.themeId;

  return (
    <MarketingShell
      currentPath={content.path}
      staffHref={staffHref}
      verticalId={content.themeId}
    >
      <JsonLd data={jsonLd} />
      <main>
        <MarketingVerticalHero
          content={content}
          secondary={verticalHeroSecondary(content, demoHref)}
        />

        <section
          className={`${styles.verticalBand} ${styles.verticalSurfaceSoft}`}
          aria-labelledby={`${id}-problem`}
        >
          <div className={styles.inner}>
            <div className={`${styles.verticalIntro} ${styles.sectionStack}`}>
              <MarketingRevealGroup>
                <MarketingRevealItem delay={0}>
                  <p className={styles.eyebrow}>{content.problem.eyebrow}</p>
                </MarketingRevealItem>
                <MarketingRevealItem delay={editorialRevealDelay(1)}>
                  <h2 id={`${id}-problem`} className={styles.sectionTitle}>
                    {content.problem.h2}
                  </h2>
                </MarketingRevealItem>
              </MarketingRevealGroup>
            </div>
            <div className={styles.verticalProblemGrid}>
              {content.problem.cards.map((card, index) => (
                <MarketingRevealCard
                  key={card.title}
                  index={index}
                  className={styles.verticalProblemSlot}
                >
                  <article className={styles.verticalProblemCard}>
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                  </article>
                </MarketingRevealCard>
              ))}
            </div>
          </div>
        </section>

        {/* Solution omits an eyebrow on purpose: problem has one, then the
            branded-home section leads with the H2 so the page can breathe. */}
        <section
          className={`${styles.verticalBand} ${styles.verticalSurfaceCanvas}`}
          aria-labelledby={`${id}-solution`}
        >
          <div className={styles.inner}>
            <div className={styles.verticalSolutionLayout}>
              <div
                className={`${styles.verticalSolutionCopy} ${styles.sectionStack}`}
              >
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <h2 id={`${id}-solution`} className={styles.sectionTitle}>
                      {content.solution.h2}
                    </h2>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <p className={styles.copy}>{content.solution.body}</p>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </div>
              <ul className={styles.verticalBenefitList}>
                {content.solution.benefits.map((card, index) => (
                  <MarketingRevealCard
                    key={card.title}
                    as="li"
                    index={index}
                    className={styles.verticalBenefitRow}
                  >
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                  </MarketingRevealCard>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section
          className={`${styles.verticalBand} ${styles.verticalSurfaceSoft}`}
          aria-labelledby={`${id}-guidance`}
        >
          <div className={styles.inner}>
            <div
              className={`${styles.verticalGuidanceLayout} ${styles.sectionStack}`}
            >
              <MarketingRevealGroup>
                <MarketingRevealItem delay={0}>
                  <p className={styles.eyebrow}>{content.guidance.eyebrow}</p>
                </MarketingRevealItem>
                <MarketingRevealItem delay={editorialRevealDelay(1)}>
                  <h2 id={`${id}-guidance`} className={styles.sectionTitle}>
                    {content.guidance.h2}
                  </h2>
                </MarketingRevealItem>
                <MarketingRevealItem delay={editorialRevealDelay(2)}>
                  <p className={styles.copy}>{content.guidance.body}</p>
                  {content.guidance.items ? (
                    <ul className={styles.verticalExampleList}>
                      {content.guidance.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </MarketingRevealItem>
              </MarketingRevealGroup>
              <aside className={styles.verticalGuidanceAside}>
                {content.guidance.status ? (
                  <p className={styles.verticalStatus}>
                    <span className={styles.verticalStatusLabel}>
                      {content.guidance.status.label}
                    </span>
                    <span className={styles.verticalStatusValue}>
                      {content.guidance.status.value}
                    </span>
                  </p>
                ) : null}
                {content.guidance.boundary ? (
                  <p className={styles.verticalBoundary}>
                    {content.guidance.boundary}
                  </p>
                ) : null}
                {content.guidance.note ? (
                  <p className={styles.verticalNote}>{content.guidance.note}</p>
                ) : null}
              </aside>
            </div>
          </div>
        </section>

        {/* Workflow also stays eyebrow-free: guidance carries the label,
            then the numbered rail starts from the H2. */}
        <section
          id="workflow"
          className={`${styles.verticalBand} ${styles.verticalSurfaceCanvas}`}
          aria-labelledby={`${id}-workflow`}
        >
          <div className={styles.inner}>
            <div className={`${styles.verticalIntro} ${styles.sectionStack}`}>
              <MarketingRevealGroup>
                <MarketingRevealItem delay={0}>
                  <h2 id={`${id}-workflow`} className={styles.sectionTitle}>
                    {content.workflow.h2}
                  </h2>
                </MarketingRevealItem>
              </MarketingRevealGroup>
            </div>
            <div className={styles.verticalRailWrap}>
              <MarketingRevealItem
                as="span"
                delay={0}
                rail
                className={styles.verticalRailLine}
                ariaHidden
              >
                {null}
              </MarketingRevealItem>
              <ol className={styles.verticalRail}>
                {content.workflow.steps.map((step, index) => (
                  <MarketingRevealCard
                    key={step.title}
                    as="li"
                    index={index}
                    className={styles.verticalRailStep}
                  >
                    <span
                      className={styles.verticalRailIndex}
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className={styles.verticalRailCopy}>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                  </MarketingRevealCard>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {content.extras.map((extra) =>
          extra.kind === "demo" ? (
            <section
              key={extra.h2}
              className={`${styles.verticalBand} ${styles.verticalSurfaceShowcase}`}
              aria-labelledby={`${id}-demo`}
            >
              <div className={styles.inner}>
                <div
                  className={`${styles.verticalProofLayout} ${styles.sectionStack}`}
                >
                  <MarketingRevealGroup>
                    <MarketingRevealItem delay={0}>
                      <p className={styles.eyebrow}>{extra.eyebrow}</p>
                    </MarketingRevealItem>
                    <MarketingRevealItem delay={editorialRevealDelay(1)}>
                      <h2 id={`${id}-demo`} className={styles.sectionTitle}>
                        {extra.h2}
                      </h2>
                    </MarketingRevealItem>
                    <MarketingRevealItem delay={editorialRevealDelay(2)}>
                      <p className={styles.copy}>{extra.body}</p>
                      <div className={styles.actions}>
                        <MarketingPrimaryAnchor href={demoHref}>
                          {extra.ctaLabel}
                        </MarketingPrimaryAnchor>
                      </div>
                    </MarketingRevealItem>
                  </MarketingRevealGroup>
                  <MarketingRevealItem delay={editorialRevealDelay(2)}>
                    <div className={styles.verticalProofPanel}>
                      <p className={styles.verticalProofKicker}>
                        {extra.preview.kicker}
                      </p>
                      <p className={styles.verticalProofTitle}>
                        {extra.preview.title}
                      </p>
                      <ul className={styles.verticalProofFacts}>
                        {extra.preview.facts.map((fact) => (
                          <li key={fact}>{fact}</li>
                        ))}
                      </ul>
                    </div>
                  </MarketingRevealItem>
                </div>
              </div>
            </section>
          ) : (
            <section
              key={extra.h2}
              className={`${styles.verticalBand} ${styles.verticalSurfaceShowcase}`}
              aria-labelledby={`${id}-extra`}
            >
              <div className={styles.inner}>
                <div
                  className={`${styles.verticalFitLayout} ${styles.sectionStack}`}
                >
                  <MarketingRevealGroup>
                    <MarketingRevealItem delay={0}>
                      <p className={styles.eyebrow}>{extra.eyebrow}</p>
                    </MarketingRevealItem>
                    <MarketingRevealItem delay={editorialRevealDelay(1)}>
                      <h2 id={`${id}-extra`} className={styles.sectionTitle}>
                        {extra.h2}
                      </h2>
                    </MarketingRevealItem>
                    <MarketingRevealItem delay={editorialRevealDelay(2)}>
                      <p className={styles.copy}>{extra.body}</p>
                    </MarketingRevealItem>
                  </MarketingRevealGroup>
                  <ul className={styles.verticalFitList}>
                    {extra.highlights.map((item, index) => (
                      <MarketingRevealCard
                        key={item.title}
                        as="li"
                        index={index}
                        className={styles.verticalFitItem}
                      >
                        <h3>{item.title}</h3>
                        <p>{item.body}</p>
                      </MarketingRevealCard>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )
        )}

        <section
          className={`${styles.verticalBand} ${styles.verticalSurfaceSoft} ${styles.verticalFaqBand}`}
          aria-labelledby={`${id}-faq`}
        >
          <div className={styles.inner}>
            <MarketingRevealGroup>
              <div
                className={`${styles.verticalFaqIntro} ${styles.sectionStack}`}
              >
                <MarketingRevealItem delay={0}>
                  <p className={styles.eyebrow}>{content.faq.eyebrow}</p>
                </MarketingRevealItem>
                <MarketingRevealItem delay={editorialRevealDelay(1)}>
                  <h2 id={`${id}-faq`} className={styles.sectionTitle}>
                    {content.faq.h2}
                  </h2>
                </MarketingRevealItem>
              </div>
              <MarketingRevealItem delay={editorialRevealDelay(1)}>
                <MarketingFaq
                  headingId={`${id}-faq`}
                  items={content.faq.items}
                />
              </MarketingRevealItem>
            </MarketingRevealGroup>
          </div>
        </section>

        <div className={styles.marketingClosing} data-mk-chapter="closing">
          <section
            className={`${styles.ctaBlock} ${styles.verticalCtaBlock}`}
            aria-labelledby={`${id}-cta`}
          >
            <MarketingRevealGroup>
              <div className={`${styles.inner} ${styles.closingCta}`}>
                <div className={styles.closingCtaCopy}>
                  <MarketingRevealItem delay={0}>
                    <h2 id={`${id}-cta`}>{content.cta.h2}</h2>
                    <p className={styles.copy}>{content.cta.body}</p>
                  </MarketingRevealItem>
                </div>
                <MarketingRevealItem delay={editorialRevealDelay(1)}>
                  <div className={styles.verticalCtaActions}>
                    <MarketingPrimaryLink href="/contact">
                      {content.cta.label}
                    </MarketingPrimaryLink>
                    <Link
                      className={`${styles.textLink} ${styles.verticalCtaSecondary}`}
                      href={content.cta.secondaryHref}
                    >
                      {content.cta.secondaryLabel}
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
