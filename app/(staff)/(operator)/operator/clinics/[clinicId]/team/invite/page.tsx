import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InviteUserForm } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/team/invite-user-form";
import { BackArrowIcon } from "@/app/(staff)/components/icons";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { loadTeamAllowance } from "@/lib/entitlements/team-usage";
import { getOperatorClinic } from "@/lib/operator/get-operator-clinic";

interface InviteUserPageProps {
  params: Promise<{ clinicId: string }>;
}

export const metadata: Metadata = {
  title: `Invite user · ${PRODUCT_NAME}`,
};

export default async function InviteUserPage({ params }: InviteUserPageProps) {
  await requirePlatformOperator();
  const { clinicId } = await params;
  const [clinic, allowance] = await Promise.all([
    getOperatorClinic(clinicId),
    loadTeamAllowance(clinicId),
  ]);
  if (!clinic) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6">
      <header>
        <PortalBreadcrumb
          items={[
            { href: "/operator/clinics", label: "All Clinics" },
            {
              href: `/operator/clinics/${clinicId}`,
              label: clinic.displayName,
            },
            { href: `/operator/clinics/${clinicId}/team`, label: "Team" },
            { label: "Invite user" },
          ]}
        />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Platform
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Invite user
        </h1>
        <p className="mt-2 text-sm text-staff-muted">
          River Aftercare emails a one-time setup link. The recipient chooses
          their own password. Access becomes active only after they accept.
        </p>
      </header>
      <InviteUserForm
        clinicId={clinicId}
        overrideRequired={allowance.atLimit}
        usageLabel={allowance.usageLabel}
      />
      <p>
        <Link
          href={`/operator/clinics/${clinicId}/team`}
          className="staffBtn staffBtnQuiet gap-1 px-0"
          aria-label="Back to team"
        >
          <BackArrowIcon />
          Back to team
        </Link>
      </p>
    </div>
  );
}
