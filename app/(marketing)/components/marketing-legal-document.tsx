import type { ReactNode } from "react";

import { MarketingPageHero } from "@/app/(marketing)/components/marketing-page-hero";
import type { LegalDocument } from "@/lib/legal/document";
import {
  parseLegalInline,
  type LegalInlineNode,
} from "@/lib/legal/inline-markup";

import styles from "../marketing.module.css";

function LegalInline({ nodes }: { nodes: readonly LegalInlineNode[] }) {
  return nodes.map((node, index) => {
    const key = `${node.type}-${index}`;

    if (node.type === "text") {
      return <span key={key}>{node.value}</span>;
    }

    if (node.type === "strong") {
      return (
        <strong key={key}>
          <LegalInline nodes={node.children} />
        </strong>
      );
    }

    return (
      <a key={key} className={styles.legalInlineLink} href={node.href}>
        <LegalInline nodes={node.children} />
      </a>
    );
  });
}

function LegalRichText({ text }: { text: string }): ReactNode {
  return <LegalInline nodes={parseLegalInline(text)} />;
}

export function MarketingLegalDocument({
  document,
}: {
  document: LegalDocument;
}) {
  return (
    <>
      <MarketingPageHero
        variant="legal"
        eyebrow={document.eyebrow}
        titleId={`${document.slug.slice(1)}-hero`}
        title={document.title}
        intro={document.intro}
      />
      <div className={styles.marketingSoft} data-mk-chapter="soft">
        <article
          className={`${styles.band} ${styles.legalArticle}`}
          aria-labelledby={`${document.slug.slice(1)}-hero`}
        >
          <div className={styles.inner}>
            {document.draftBanner ? (
              <p className={styles.legalBanner} role="note">
                {document.draftBanner}
              </p>
            ) : null}
            <p className={styles.legalUpdated}>
              Last updated{" "}
              <time dateTime={document.lastUpdatedIso}>
                {document.lastUpdatedLabel}
              </time>
              .
            </p>
            {document.preamble.map((paragraph) => (
              <p key={paragraph} className={styles.legalCopy}>
                <LegalRichText text={paragraph} />
              </p>
            ))}
            {document.sections.map((section) => (
              <section
                key={section.id}
                className={styles.legalSection}
                aria-labelledby={`legal-${section.id}`}
              >
                <h2 id={`legal-${section.id}`} className={styles.legalHeading}>
                  {section.title}
                </h2>
                {section.blocks.map((block, index) => {
                  if (block.type === "ul") {
                    return (
                      <ul
                        key={`${section.id}-list-${index}`}
                        className={styles.legalList}
                      >
                        {block.items.map((item) => (
                          <li key={item}>
                            <LegalRichText text={item} />
                          </li>
                        ))}
                      </ul>
                    );
                  }

                  if (block.type === "placeholder") {
                    return (
                      <p
                        key={`${section.id}-placeholder-${index}`}
                        className={styles.legalPlaceholder}
                      >
                        {block.text}
                      </p>
                    );
                  }

                  if (block.type === "address") {
                    return (
                      <address
                        key={`${section.id}-address-${index}`}
                        className={styles.legalAddress}
                      >
                        {block.lines.map((line) => (
                          <p key={line}>
                            <LegalRichText text={line} />
                          </p>
                        ))}
                      </address>
                    );
                  }

                  return (
                    <p
                      key={`${section.id}-p-${index}`}
                      className={styles.legalCopy}
                    >
                      <LegalRichText text={block.text} />
                    </p>
                  );
                })}
              </section>
            ))}
          </div>
        </article>
      </div>
    </>
  );
}
