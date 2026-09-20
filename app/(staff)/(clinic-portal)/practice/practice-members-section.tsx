"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";

import {
  updateStaffMembershipStatusAction,
  type MembershipStatusActionState,
} from "@/app/(staff)/(clinic-portal)/practice/membership-actions";
import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import { clinicMembershipRoleLabel } from "@/lib/clinic-portal/role-labels";
import { ClinicMembershipRole } from "@prisma/client";
import type { PracticeMemberRow } from "@/lib/clinic-portal/list-practice-members";

const empty: MembershipStatusActionState = {};
const DEACTIVATE_PENDING_STATUS = "Deactivating clinic access. Please wait.";
const ACTIVATE_PENDING_STATUS = "Restoring clinic access. Please wait.";

function memberDisplayName(row: PracticeMemberRow): string {
  return row.name?.trim() || row.email;
}

export function PracticeMembersSection({
  clinicName,
  rows,
}: {
  clinicName: string;
  rows: PracticeMemberRow[];
}) {
  const router = useRouter();
  const reactId = useId().replace(/:/g, "");
  const formId = `membership-status-${reactId}`;
  const [target, setTarget] = useState<PracticeMemberRow | null>(null);
  const [desiredActive, setDesiredActive] = useState(false);
  const [state, action, pending] = useActionState(
    updateStaffMembershipStatusAction,
    empty
  );

  useEffect(() => {
    if (state.success) {
      setTarget(null);
      router.refresh();
    }
  }, [router, state.success]);

  useEffect(() => {
    if (state.error) {
      setTarget(null);
    }
  }, [state.error]);

  return (
    <section
      className="mt-8 rounded-xl border border-staff-line bg-staff-panel p-5"
      aria-labelledby="practice-members-heading"
    >
      <h2
        id="practice-members-heading"
        className="text-base font-semibold tracking-tight"
      >
        Members
      </h2>
      <p className="mt-2 text-sm leading-6 text-staff-muted">
        Clinic staff access is per membership. Deactivating someone removes
        access to {clinicName} only. Their River Aftercare account stays intact.
      </p>
      {state.success ? (
        <p className="mt-3 text-sm text-staff-ink" role="status">
          {state.success}
        </p>
      ) : null}
      {state.error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <form id={formId} action={action} className="hidden">
        <input
          type="hidden"
          name="membershipId"
          value={target?.membershipId ?? ""}
        />
        <input
          type="hidden"
          name="active"
          value={desiredActive ? "true" : "false"}
        />
      </form>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-staff-muted">No members yet.</p>
      ) : (
        <div className="staffOperatorTableWrap mt-4">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Clinic members</caption>
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
                  key={row.membershipId}
                  className="border-b border-staff-line last:border-0"
                  data-active={row.active ? "true" : "false"}
                >
                  <td className="max-w-[12rem] truncate px-4 py-3">
                    {row.name || "—"}
                  </td>
                  <td className="max-w-[16rem] truncate px-4 py-3 text-staff-muted">
                    {row.email}
                  </td>
                  <td className="px-4 py-3">
                    {clinicMembershipRoleLabel(row.role)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="staffStatusPill"
                      data-tone={row.active ? "success" : "inactive"}
                    >
                      {row.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.role === ClinicMembershipRole.STAFF ? (
                      <button
                        type="button"
                        className="staffBtn staffBtnSecondary"
                        disabled={pending}
                        onClick={() => {
                          setDesiredActive(!row.active);
                          setTarget(row);
                        }}
                      >
                        {row.active ? "Deactivate" : "Activate"}
                      </button>
                    ) : (
                      <span className="text-sm text-staff-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={target !== null && !desiredActive}
        title={target ? `Deactivate ${memberDisplayName(target)}?` : ""}
        description={
          target
            ? `They will lose access to ${clinicName} until reactivated. Their River Aftercare account is not deleted.`
            : ""
        }
        cancelLabel="Cancel"
        confirmLabel="Deactivate"
        pending={pending}
        pendingLabel="Deactivating…"
        pendingStatus={DEACTIVATE_PENDING_STATUS}
        confirmTone="danger"
        onCancel={() => {
          if (pending) {
            return;
          }
          setTarget(null);
        }}
        onConfirm={() => {
          const form = document.getElementById(
            formId
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
      <ConfirmDialog
        open={target !== null && desiredActive}
        title={target ? `Activate ${memberDisplayName(target)}?` : ""}
        description={
          target
            ? `They will regain access to ${clinicName} with their existing membership.`
            : ""
        }
        cancelLabel="Cancel"
        confirmLabel="Activate"
        pending={pending}
        pendingLabel="Activating…"
        pendingStatus={ACTIVATE_PENDING_STATUS}
        confirmTone="primary"
        onCancel={() => {
          if (pending) {
            return;
          }
          setTarget(null);
        }}
        onConfirm={() => {
          const form = document.getElementById(
            formId
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
    </section>
  );
}
