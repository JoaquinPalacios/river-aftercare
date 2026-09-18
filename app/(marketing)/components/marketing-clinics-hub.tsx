import Link from "next/link";

import {
  MarketingRevealCard,
  MarketingRevealGroup,
  MarketingRevealItem,
} from "@/app/(marketing)/components/marketing-experience";
import { MarketingPrimaryLink } from "@/app/(marketing)/components/marketing-primary-link";
import { MarketingShell } from "@/app/(marketing)/components/marketing-shell";
import { JsonLd } from "@/app/(marketing)/components/json-ld";
import {
  CLINICS_HUB_CARDS,
  CLINICS_HUB_COPY,
} from "@/lib/marketing/clinics-hub";
import { editorialRevealDelay } from "@/lib/marketing/reveal-timing";
import type { JsonLdGraph } from "@/lib/seo/json-ld";

import styles from "../marketing.module.css";

export function MarketingClinicsHub({
  staffHref,
  jsonLd,
}: {
  staffHref: string;
  jsonLd: JsonLdGraph;
}) {
  const copy = CLINICS_HUB_COPY;

  return (
    <MarketingShell currentPath="/clinics" staffHref={staffHref}>
      <JsonLd data={jsonLd} />
      <main>
        <section
          className={`${styles.clinicsHubHero} ${styles.marketingBase}`}
          aria-labelledby="clinics-hero"
          data-mk-clinics-hub=""
        >
          <div className={`${styles.inner} ${styles.clinicsHubHeroInner}`}>
            <MarketingRevealGroup>
              <div className={styles.clinicsHubCopy}>
                <MarketingRevealItem delay={0}>
                  <p className={styles.eyebrow}>{copy.hero.eyebrow}</p>
                </MarketingRevealItem>
                <MarketingRevealItem delay={editorialRevealDelay(1)}>
                  <h1 id="clinics-hero" className={styles.clinicsHubTitle}>
                    {copy.hero.h1}
                  </h1>
                </MarketingRevealItem>
                <MarketingRevealItem delay={editorialRevealDelay(2)}>
                  <p className={`${styles.copy} ${styles.clinicsHubLede}`}>
                    {copy.hero.body}
                  </p>
                </MarketingRevealItem>
                <MarketingRevealItem delay={editorialRevealDelay(3)}>
                  <div
                    className={`${styles.actions} ${styles.heroActions}`}
                    data-mk-hero-actions=""
                  >
                    <MarketingPrimaryLink href="/contact">
                      {copy.hero.primaryCta}
                    </MarketingPrimaryLink>
                    <a
                      className={`${styles.button} ${styles.secondary}`}
                      href="#clinic-types"
                    >
                      {copy.hero.secondaryCta}
                    </a>
                  </div>
                </MarketingRevealItem>
              </div>
              <MarketingRevealItem
                delay={editorialRevealDelay(2)}
                className={styles.clinicsHubVisualSlot}
              >
                <figure
                  className={styles.clinicsHubVisual}
                  aria-label={copy.visual.label}
                >
                  <ul className={styles.clinicsHubPaths}>
                    {copy.visual.paths.map((path) => (
                      <li
                        key={path.themeId}
                        className={styles.clinicsHubPath}
                        data-vertical={path.themeId}
                      >
                        <span className={styles.clinicsHubPathLabel}>
                          {path.label}
                        </span>
                        <span className={styles.clinicsHubPathDetail}>
                          {path.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.clinicsHubCore} aria-hidden="true">
                    <p className={styles.clinicsHubCoreTitle}>
                      {copy.visual.coreTitle}
                    </p>
                    <p className={styles.clinicsHubCoreFacts}>
                      {copy.visual.coreFacts.join(" · ")}
                    </p>
                  </div>
                </figure>
              </MarketingRevealItem>
            </MarketingRevealGroup>
          </div>
        </section>

        <div className={styles.marketingSoft} data-mk-chapter="soft">
          <section className={styles.band} aria-labelledby="clinics-platform">
            <div className={styles.inner}>
              <div className={styles.headingBlock}>
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <p className={styles.eyebrow}>{copy.platform.eyebrow}</p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <h2 id="clinics-platform" className={styles.sectionTitle}>
                      {copy.platform.h2}
                    </h2>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(2)}>
                    <p
                      className={`${styles.copy} ${styles.clinicsHubPlatform}`}
                    >
                      {copy.platform.body}
                    </p>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </div>
            </div>
          </section>
        </div>

        <section
          id="clinic-types"
          className={`${styles.band} ${styles.clinicsHubDiscovery}`}
          aria-labelledby="clinics-discovery"
        >
          <div className={styles.inner}>
            <div className={styles.headingBlock}>
              <MarketingRevealGroup>
                <MarketingRevealItem delay={0}>
                  <p className={styles.eyebrow}>{copy.discovery.eyebrow}</p>
                </MarketingRevealItem>
                <MarketingRevealItem delay={editorialRevealDelay(1)}>
                  <h2 id="clinics-discovery" className={styles.sectionTitle}>
                    {copy.discovery.h2}
                  </h2>
                </MarketingRevealItem>
              </MarketingRevealGroup>
            </div>
            <div className={`${styles.clinicsHubGrid} ${styles.headingFollow}`}>
              {CLINICS_HUB_CARDS.map((card, index) => (
                <MarketingRevealCard
                  key={card.path}
                  index={index}
                  className={styles.clinicsHubCardSlot}
                >
                  <Link
                    className={styles.clinicsHubCard}
                    href={card.path}
                    data-vertical={card.themeId}
                  >
                    <span
                      className={styles.clinicsHubCardRail}
                      aria-hidden="true"
                    />
                    <h3>{card.label}</h3>
                    <p>{card.body}</p>
                    <span className={styles.clinicsHubCardCta}>
                      {card.cta}
                      <span
                        className={styles.clinicsHubCardArrow}
                        data-mk-card-arrow=""
                        aria-hidden="true"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          width="14"
                          height="14"
                          focusable="false"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 8h9.5" />
                          <path d="M8.75 4.25 13 8l-4.25 3.75" />
                        </svg>
                      </span>
                    </span>
                  </Link>
                </MarketingRevealCard>
              ))}
            </div>
          </div>
        </section>

        <div className={styles.marketingSoft} data-mk-chapter="soft">
          <section className={styles.band} aria-labelledby="clinics-foundation">
            <div className={styles.inner}>
              <div className={styles.clinicsHubFoundation}>
                <div className={styles.headingBlock}>
                  <MarketingRevealGroup>
                    <MarketingRevealItem delay={0}>
                      <p className={styles.eyebrow}>
                        {copy.foundation.eyebrow}
                      </p>
                    </MarketingRevealItem>
                    <MarketingRevealItem delay={editorialRevealDelay(1)}>
                      <h2
                        id="clinics-foundation"
                        className={styles.sectionTitle}
                      >
                        {copy.foundation.h2}
                      </h2>
                    </MarketingRevealItem>
                  </MarketingRevealGroup>
                </div>
                <ol className={styles.clinicsHubPrinciples}>
                  {copy.foundation.items.map((item, index) => (
                    <MarketingRevealCard
                      key={item.title}
                      as="li"
                      index={index}
                      className={styles.clinicsHubPrinciple}
                    >
                      <span
                        className={styles.clinicsHubPrincipleIndex}
                        aria-hidden="true"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.body}</p>
                      </div>
                    </MarketingRevealCard>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          <section className={styles.band} aria-labelledby="clinics-other">
            <div className={styles.inner}>
              <div className={styles.clinicsHubOther}>
                <MarketingRevealGroup>
                  <MarketingRevealItem delay={0}>
                    <p className={`${styles.eyebrow} ${styles.eyebrowFlow}`}>
                      {copy.other.eyebrow}
                    </p>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(1)}>
                    <h2 id="clinics-other" className={styles.sectionTitle}>
                      {copy.other.h2}
                    </h2>
                  </MarketingRevealItem>
                  <MarketingRevealItem delay={editorialRevealDelay(2)}>
                    <p className={styles.copy}>{copy.other.body}</p>
                    <div className={styles.actions}>
                      <MarketingPrimaryLink href="/contact">
                        {copy.other.cta}
                      </MarketingPrimaryLink>
                    </div>
                  </MarketingRevealItem>
                </MarketingRevealGroup>
              </div>
            </div>
          </section>
        </div>

        <div className={styles.marketingClosing} data-mk-chapter="closing">
          <section
            className={`${styles.ctaBlock} ${styles.verticalCtaBlock}`}
            aria-labelledby="clinics-cta"
          >
            <MarketingRevealGroup>
              <div className={`${styles.inner} ${styles.closingCta}`}>
                <div className={styles.closingCtaCopy}>
                  <MarketingRevealItem delay={0}>
                    <h2 id="clinics-cta">{copy.cta.h2}</h2>
                    <p className={styles.copy}>{copy.cta.body}</p>
                  </MarketingRevealItem>
                </div>
                <MarketingRevealItem delay={editorialRevealDelay(1)}>
                  <div className={styles.verticalCtaActions}>
                    <MarketingPrimaryLink href="/contact">
                      {copy.cta.primary}
                    </MarketingPrimaryLink>
                    <Link
                      className={`${styles.textLink} ${styles.verticalCtaSecondary}`}
                      href="/pricing"
                    >
                      {copy.cta.secondary}
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
