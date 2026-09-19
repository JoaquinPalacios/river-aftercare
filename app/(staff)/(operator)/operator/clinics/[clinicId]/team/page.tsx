import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClinicTeamTable } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/team/team-table";
import { BackArrowIcon } from "@/app/(staff)/components/icons";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { listClinicTeam } from "@/lib/operator/list-clinic-team";

interface ClinicTeamPageProps {
  params: Promise<{ clinicId: string }>;
}

export const metadata: Metadata = {
  title: `Team · ${PRODUCT_NAME}`,
};

export default async function ClinicTeamPage({ params }: ClinicTeamPageProps) {
  await requirePlatformOperator();
  const { clinicId } = await params;
  const team = await listClinicTeam(clinicId);
  if (!team) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <PortalBreadcrumb
            items={[
              { href: "/operator/clinics", label: "All Clinics" },
              { href: `/operator/clinics/${clinicId}`, label: team.clinicName },
              { label: "Team" },
            ]}
          />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
            Platform
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Team</h1>
          <p className="mt-2 text-sm text-staff-muted">
            Manage who can access {team.clinicName}.
          </p>
        </div>
        <Link
          href={`/operator/clinics/${clinicId}/team/invite`}
          className="staffBtn staffBtnPrimary"
        >
          Invite user
        </Link>
      </header>
      <ClinicTeamTable clinicId={clinicId} rows={team.rows} />
      <p>
        <Link
          href={`/operator/clinics/${clinicId}`}
          className="staffBtn staffBtnQuiet gap-1 px-0"
          aria-label={`Back to ${team.clinicName}`}
        >
          <BackArrowIcon />
          Clinic details
        </Link>
      </p>
    </div>
  );
}
