import type { Metadata } from "next";

import { PatientStatusPage } from "@/app/(aftercare)/components/patient-status-page";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  PATIENT_NOT_FOUND_BODY,
  PATIENT_NOT_FOUND_TITLE,
} from "@/lib/errors/copy";
import { TENANT_LAUNCH_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `${PATIENT_NOT_FOUND_TITLE} · ${PRODUCT_NAME}`,
  robots: TENANT_LAUNCH_ROBOTS,
};

export default function AftercareNotFound() {
  return (
    <PatientStatusPage
      title={PATIENT_NOT_FOUND_TITLE}
      description={PATIENT_NOT_FOUND_BODY}
    />
  );
}
