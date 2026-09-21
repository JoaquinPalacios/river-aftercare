import type { ReactNode } from "react";

import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";

import "@/app/(aftercare)/aftercare.css";

export default async function GuidePreviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { clinicMembership } = await requireStaffSession();
  await enforcePrePaymentActivationGate(clinicMembership);
  return children;
}
