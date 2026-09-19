"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  cancelClinicInvitationAction,
  resendClinicInvitationAction,
  type ClinicTeamActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/team/actions";
import { teamMembershipRoleLabel } from "@/lib/clinic-portal/role-labels";
import type { ClinicTeamRow } from "@/lib/operator/list-clinic-team";

const empty: ClinicTeamActionState = {};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function statusLabel(row: ClinicTeamRow): string {
  if (row.status === "active") {
    return "Active";
  }
  if (row.status === "expired") {
    return "Invitation expired";
  }
  const expires = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(asDate(row.expiresAt));
  return `Invitation pending · expires ${expires}`;
}

function statusTone(status: ClinicTeamRow["status"]): "success" | "warning" {
  return status === "active" ? "success" : "warning";
}

export function ClinicTeamTable({
  clinicId,
  rows,
}: {
  clinicId: string;
  rows: ClinicTeamRow[];
}) {
  const router = useRouter();
  const [resendState, resendAction, resending] = useActionState(
    resendClinicInvitationAction,
    empty
  );
  const [cancelState, cancelAction, cancelling] = useActionState(
    cancelClinicInvitationAction,
    empty
  );

  useEffect(() => {
    if (resendState.success || cancelState.success) {
      router.refresh();
    }
  }, [resendState, cancelState, router]);

  const error = resendState.error ?? cancelState.error;
  const success = resendState.success ?? cancelState.success;
  const pending = resending || cancelling;

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-staff-line bg-staff-panel px-5 py-8 text-sm text-staff-muted">
        No team members yet. Invite an administrator or staff member to this
        clinic.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {success ? (
        <p className="text-sm text-staff-ink" role="status">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="staffOperatorTableWrap">
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">Clinic team</caption>
          <thead className="border-b border-staff-line text-staff-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.kind}-${row.userId}`}
                className="border-b border-staff-line last:border-0"
              >
                <td className="max-w-[12rem] truncate px-4 py-3">
                  {row.name || "—"}
                </td>
                <td className="max-w-[16rem] truncate px-4 py-3 text-staff-muted">
                  {row.email}
                </td>
                <td className="px-4 py-3">
                  {teamMembershipRoleLabel(row.role)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="staffStatusPill"
                    data-tone={statusTone(row.status)}
                  >
                    {row.status === "active"
                      ? "Active"
                      : row.status === "expired"
                        ? "Invitation expired"
                        : "Pending"}
                  </span>
                  {row.kind === "invitation" ? (
                    <p className="mt-1 text-xs text-staff-muted">
                      {statusLabel(row)}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {row.kind === "member" ? (
                    <span className="text-staff-muted">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <form action={resendAction}>
                        <input type="hidden" name="clinicId" value={clinicId} />
                        <input type="hidden" name="userId" value={row.userId} />
                        <button
                          type="submit"
                          disabled={pending}
                          className="staffBtn staffBtnSecondary"
                        >
                          {resending ? "Sending…" : "Resend invitation"}
                        </button>
                      </form>
                      <form action={cancelAction}>
                        <input type="hidden" name="clinicId" value={clinicId} />
                        <input type="hidden" name="userId" value={row.userId} />
                        <button
                          type="submit"
                          disabled={pending}
                          className="staffBtn staffBtnQuiet"
                        >
                          {cancelling ? "Cancelling…" : "Cancel invitation"}
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
