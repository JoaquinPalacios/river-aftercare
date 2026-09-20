import { PatientStatusPage } from "@/app/(aftercare)/components/patient-status-page";
import {
  CLINIC_GUIDES_HOME_LABEL,
  PATIENT_NOT_FOUND_BODY,
  PATIENT_NOT_FOUND_TITLE,
} from "@/lib/errors/copy";

export default function TenantNotFound() {
  return (
    <PatientStatusPage
      title={PATIENT_NOT_FOUND_TITLE}
      description={PATIENT_NOT_FOUND_BODY}
      actions={
        <a href="/" className="notFoundHome">
          {CLINIC_GUIDES_HOME_LABEL}
        </a>
      }
    />
  );
}
