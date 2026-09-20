import type { Metadata } from "next";
import Link from "next/link";

import { StaffStatusPage } from "@/app/(staff)/components/staff-status-page";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  BACK_DASHBOARD_LABEL,
  STAFF_NOT_FOUND_BODY,
  STAFF_NOT_FOUND_TITLE,
} from "@/lib/errors/copy";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `${STAFF_NOT_FOUND_TITLE} · ${PRODUCT_NAME}`,
  robots: PRIVATE_ROBOTS,
};

export default function StaffNotFound() {
  return (
    <StaffStatusPage
      title={STAFF_NOT_FOUND_TITLE}
      description={STAFF_NOT_FOUND_BODY}
      actions={
        <Link href="/dashboard" className="staffBtn staffBtnPrimary">
          {BACK_DASHBOARD_LABEL}
        </Link>
      }
    />
  );
}
