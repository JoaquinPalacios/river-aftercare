import type { Metadata } from "next";

import {
  MarketingStatusLink,
  MarketingStatusPage,
} from "@/app/(marketing)/components/marketing-status-page";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  CONTACT_US_LABEL,
  GO_HOME_LABEL,
  MARKETING_NOT_FOUND_BODY,
  MARKETING_NOT_FOUND_TITLE,
} from "@/lib/errors/copy";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `${MARKETING_NOT_FOUND_TITLE} · ${PRODUCT_NAME}`,
  robots: PRIVATE_ROBOTS,
};

export default function MarketingNotFound() {
  return (
    <MarketingStatusPage
      title={MARKETING_NOT_FOUND_TITLE}
      description={MARKETING_NOT_FOUND_BODY}
      actions={
        <>
          <MarketingStatusLink href="/" primary>
            {GO_HOME_LABEL}
          </MarketingStatusLink>
          <MarketingStatusLink href="/contact">
            {CONTACT_US_LABEL}
          </MarketingStatusLink>
        </>
      }
    />
  );
}
