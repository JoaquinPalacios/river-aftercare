import Link from "next/link";

import { MarketingPrimaryAnchor } from "@/app/(marketing)/components/marketing-primary-anchor";
import { MarketingPrimaryLink } from "@/app/(marketing)/components/marketing-primary-link";
import {
  cataloguePlanCta,
  type CataloguePlanLink,
} from "@/lib/marketing/registration-cta";
import { marketingRegistrationOffer } from "@/lib/marketing/registration-offer";

import styles from "../marketing.module.css";

function isStaffHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

function PlanButton({
  href,
  label,
  recommended,
}: {
  href: string;
  label: string;
  recommended: boolean;
}) {
  if (recommended) {
    return isStaffHref(href) ? (
      <MarketingPrimaryAnchor className={styles.planCta} href={href}>
        {label}
      </MarketingPrimaryAnchor>
    ) : (
      <MarketingPrimaryLink className={styles.planCta} href={href}>
        {label}
      </MarketingPrimaryLink>
    );
  }

  const className = `${styles.button} ${styles.secondary} ${styles.planCta}`;
  return isStaffHref(href) ? (
    <a className={className} href={href}>
      {label}
    </a>
  ) : (
    <Link className={className} href={href}>
      {label}
    </Link>
  );
}

export function MarketingPlanCta({
  plan,
}: {
  plan: CataloguePlanLink & { recommended: boolean };
}) {
  const offer = marketingRegistrationOffer();
  const cta = cataloguePlanCta(plan, offer);
  const button = (
    <PlanButton
      href={cta.href}
      label={cta.label}
      recommended={plan.recommended}
    />
  );

  if (!offer.enabled) {
    return button;
  }

  return (
    <div className={styles.planCtaStack}>
      {button}
      {cta.assisted ? (
        <Link
          className={`${styles.textLink} ${styles.verticalCtaSecondary} ${styles.planCtaAssist}`}
          href={cta.assisted.href}
        >
          {cta.assisted.label}
        </Link>
      ) : (
        <span className={styles.planCtaAssist} aria-hidden="true" />
      )}
    </div>
  );
}
