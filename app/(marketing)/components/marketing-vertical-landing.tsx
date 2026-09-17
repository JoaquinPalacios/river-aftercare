import Link from "next/link";

import {
  MarketingRevealCard,
  MarketingRevealGroup,
  MarketingRevealItem,
} from "@/app/(marketing)/components/marketing-experience";
import { MarketingFaq } from "@/app/(marketing)/components/marketing-faq";
import { MarketingPageHero } from "@/app/(marketing)/components/marketing-page-hero";
import { MarketingPrimaryAnchor } from "@/app/(marketing)/components/marketing-primary-anchor";
import { MarketingPrimaryLink } from "@/app/(marketing)/components/marketing-primary-link";
import { MarketingShell } from "@/app/(marketing)/components/marketing-shell";
import { JsonLd } from "@/app/(marketing)/components/json-ld";
import { editorialRevealDelay } from "@/lib/marketing/reveal-timing";
import {
  VERTICAL_RELATED_LINKS,
  type VerticalLandingContent,
} from "@/lib/marketing/vertical-landing";
import type { JsonLdGraph } from "@/lib/seo/json-ld";

import styles from "../marketing.module.css";

const HERO_VARIANT = {
  "/dental": "dental",
  "/physiotherapy": "physiotherapy",
  "/chiropractic": "chiropractic",
  "/cosmetic-clinics": "cosmetic",
} as const;

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
  const secondary =
    content.hero.secondaryCta.kind === "demo" ? (
      <a className={`${styles.button} ${styles.secondary}`} href={demoHref}>
        {content.hero.secondaryCta.label}
      </a>
    ) : (
      <Link
        className={`${styles.button} ${styles.secondary}`}
        href={content.hero.secondaryCta.href}
      >
        {content.hero.secondaryCta.label}
      </Link>
    );

  return (
    <MarketingShell currentPath={content.path} staffHref={staffHref}>
      <JsonLd data={jsonLd} />
      <main>
        <MarketingPageHero
          variant={HERO_VARIANT[content.path]}
          eyebrow={content.hero.eyebrow}
          titleId={`${content.path.slice(1)}-hero`}
          title={content.hero.h1}
          intro={content.hero.body}
          wideTitle
          actions={
            <>
              <MarketingPrimaryLink href="/contact">
                {content.hero.primaryCtaLabel}
              </MarketingPrimaryLink>
              {secondary}
            </>
          }
        />

        <div className={styles.marketingSoft} data-mk-chapter="soft">
          <section
            className={styles.band}
            aria-labelledby={`${content.path.slice(1)}-problem`}
          >
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingRevealGroup>
                  {content.problem.eyebrow ? (
                    <MarketingRevealItem delay={0}>
                      <p className={styles.eyebrow}>
                        {content.problem.eyebrow}
                      </p>
                    </MarketingRevealItem>
                  ) : null}
                  <MarketingRevealItem
                    delay={editorialRevealDelay(
                      content.problem.eyebrow ? 1 : 0
                    )}
                  >
                    <h2
                      id={`${content.path.slice(1)}-problem`}
                      className={styles.sectionTitle}
                    >
                      {content.problem.h2}
                    </h2>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </div>
              <div
                className={`${styles.verticalCardGrid} ${styles.headingFollow}`}
              >
                {content.problem.cards.map((card, index) => (
                  <MarketingRevealCard
                    key={card.title}
                    index={index}
                    className={styles.verticalCardSlot}
                  >
                    <article className={styles.verticalCard}>
                      <h3>{card.title}</h3>
                      <p>{card.body}</p>
                    </article>
                  </MarketingRevealCard>
                ))}
              </div>
            </div>
          </section>

          <section
            className={styles.band}
            aria-labelledby={`${content.path.slice(1)}-solution`}
          >
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <h2
                      id={`${content.path.slice(1)}-solution`}
                      className={styles.sectionTitle}
                    >
                      {content.solution.h2}
                    </h2>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <p className={styles.copy}>{content.solution.body}</p>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </div>
              <div
                className={`${styles.verticalBenefitGrid} ${styles.headingFollow}`}
              >
                {content.solution.benefits.map((card, index) => (
                  <MarketingRevealCard
                    key={card.title}
                    index={index}
                    className={styles.verticalCardSlot}
                  >
                    <article className={styles.verticalCard}>
                      <h3>{card.title}</h3>
                      <p>{card.body}</p>
                    </article>
                  </MarketingRevealCard>
                ))}
              </div>
            </div>
          </section>

          <section
            className={styles.band}
            aria-labelledby={`${content.path.slice(1)}-guidance`}
          >
            <div className={styles.inner}>
              <MarketingRevealGroup>
                <MarketingRevealItem delay={0}>
                  <h2
                    id={`${content.path.slice(1)}-guidance`}
                    className={styles.sectionTitle}
                  >
                    {content.guidance.h2}
                  </h2>
                </MarketingRevealItem>
                <MarketingRevealItem delay={editorialRevealDelay(1)}>
                  <p className={styles.copy}>{content.guidance.body}</p>
                  {content.guidance.items ? (
                    <ul className={styles.verticalExampleList}>
                      {content.guidance.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {content.guidance.boundary ? (
                    <p className={`${styles.copy} ${styles.verticalBoundary}`}>
                      {content.guidance.boundary}
                    </p>
                  ) : null}
                  {content.guidance.note ? (
                    <p className={`${styles.copy} ${styles.verticalNote}`}>
                      {content.guidance.note}
                    </p>
                  ) : null}
                </MarketingRevealItem>
              </MarketingRevealGroup>
            </div>
          </section>

          <section
            id="workflow"
            className={styles.band}
            aria-labelledby={`${content.path.slice(1)}-workflow`}
          >
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <h2
                      id={`${content.path.slice(1)}-workflow`}
                      className={styles.sectionTitle}
                    >
                      {content.workflow.h2}
                    </h2>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </div>
              <ol
                className={`${styles.verticalWorkflow} ${styles.headingFollow}`}
              >
                {content.workflow.steps.map((step, index) => (
                  <MarketingRevealCard
                    key={step.title}
                    as="li"
                    index={index}
                    className={styles.verticalWorkflowStep}
                  >
                    <span
                      className={styles.verticalWorkflowIndex}
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                  </MarketingRevealCard>
                ))}
              </ol>
            </div>
          </section>

          {content.extras.map((extra) =>
            extra.kind === "demo" ? (
              <section
                key={extra.h2}
                className={styles.band}
                aria-labelledby={`${content.path.slice(1)}-demo`}
              >
                <div className={styles.inner}>
                  <MarketingRevealGroup>
                    <MarketingRevealItem delay={0}>
                      <h2
                        id={`${content.path.slice(1)}-demo`}
                        className={styles.sectionTitle}
                      >
                        {extra.h2}
                      </h2>
                    </MarketingRevealItem>
                    <MarketingRevealItem delay={editorialRevealDelay(1)}>
                      <p className={styles.copy}>{extra.body}</p>
                      <div className={styles.actions}>
                        <MarketingPrimaryAnchor href={demoHref}>
                          {extra.ctaLabel}
                        </MarketingPrimaryAnchor>
                      </div>
                    </MarketingRevealItem>
                  </MarketingRevealGroup>
                </div>
              </section>
            ) : (
              <section
                key={extra.h2}
                className={styles.band}
                aria-labelledby={`${content.path.slice(1)}-extra`}
              >
                <div className={styles.inner}>
                  <MarketingRevealGroup>
                    <MarketingRevealItem delay={0}>
                      <h2
                        id={`${content.path.slice(1)}-extra`}
                        className={styles.sectionTitle}
                      >
                        {extra.h2}
                      </h2>
                    </MarketingRevealItem>
                    <MarketingRevealItem delay={editorialRevealDelay(1)}>
                      <p className={styles.copy}>{extra.body}</p>
                    </MarketingRevealItem>
                  </MarketingRevealGroup>
                </div>
              </section>
            )
          )}

          <section
            className={styles.band}
            aria-labelledby={`${content.path.slice(1)}-faq`}
          >
            <div className={styles.inner}>
              <MarketingRevealGroup>
                <div className={styles.headingBlock}>
                  <MarketingRevealItem delay={0}>
                    <h2
                      id={`${content.path.slice(1)}-faq`}
                      className={styles.sectionTitle}
                    >
                      {content.faq.h2}
                    </h2>
                  </MarketingRevealItem>
                </div>
                <MarketingRevealItem delay={editorialRevealDelay(1)}>
                  <div className={styles.headingFollow}>
                    <MarketingFaq
                      headingId={`${content.path.slice(1)}-faq`}
                      items={content.faq.items}
                    />
                  </div>
                </MarketingRevealItem>
              </MarketingRevealGroup>
            </div>
          </section>
        </div>

        <div className={styles.marketingClosing} data-mk-chapter="closing">
          <section
            className={styles.ctaBlock}
            aria-labelledby={`${content.path.slice(1)}-cta`}
          >
            <MarketingRevealGroup>
              <div className={`${styles.inner} ${styles.closingCta}`}>
                <div className={styles.closingCtaCopy}>
                  <MarketingRevealItem delay={0}>
                    <h2 id={`${content.path.slice(1)}-cta`}>
                      {content.cta.h2}
                    </h2>
                    <p className={styles.copy}>{content.cta.body}</p>
                    <p className={styles.verticalRelated}>
                      {VERTICAL_RELATED_LINKS.map((link, index) => (
                        <span key={link.href}>
                          {index > 0 ? " · " : null}
                          <Link className={styles.textLink} href={link.href}>
                            {link.label}
                          </Link>
                        </span>
                      ))}
                    </p>
                  </MarketingRevealItem>
                </div>
                <MarketingRevealItem delay={editorialRevealDelay(1)}>
                  <div className={styles.closingCtaAction}>
                    <MarketingPrimaryLink href="/contact">
                      {content.cta.label}
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
