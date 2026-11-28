import Link from "next/link";

import { MarketingPrimaryLink } from "@/app/(marketing)/components/marketing-primary-link";
import { marketingRegistrationOffer } from "@/lib/marketing/registration-offer";

import styles from "../marketing.module.css";

/**
 * Keeps the assisted primary action. Adds the registration link only when
 * `REGISTRATION_ENABLED` is exactly true. A single-button close stays on
 * `.closingCtaAction` while registration is off, so that markup is unchanged.
 */
export function MarketingAssistedClose({
  primaryLabel,
  primaryHref = "/contact",
  secondary,
}: {
  primaryLabel: string;
  primaryHref?: string;
  secondary?: { href: string; label: string };
}) {
  const registration = marketingRegistrationOffer();
  const grouped = Boolean(secondary) || registration.enabled;

  return (
    <div
      className={grouped ? styles.verticalCtaActions : styles.closingCtaAction}
    >
      <MarketingPrimaryLink href={primaryHref}>
        {primaryLabel}
      </MarketingPrimaryLink>
      {secondary ? (
        <Link
          className={`${styles.textLink} ${styles.verticalCtaSecondary}`}
          href={secondary.href}
        >
          {secondary.label}
        </Link>
      ) : null}
      {registration.enabled ? (
        <a
          className={`${styles.textLink} ${styles.verticalCtaSecondary}`}
          href={registration.href}
        >
          {registration.label}
        </a>
      ) : null}
    </div>
  );
}
