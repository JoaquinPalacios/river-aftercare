"use client";

import { useActionState, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  invitePracticeMemberAction,
  updateStaffMembershipStatusAction,
  type InvitePracticeMemberState,
  type MembershipStatusActionState,
} from "@/app/(staff)/(clinic-portal)/practice/membership-actions";
import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import { LOGIN_EMAIL_MAX_LENGTH } from "@/lib/auth/login-input";
import {
  TEAM_ADMIN_ROLE_LABEL,
  TEAM_STAFF_ROLE_LABEL,
  clinicMembershipRoleLabel,
} from "@/lib/clinic-portal/role-labels";
import { INVITED_NAME_MAX_LENGTH } from "@/lib/operator/clinic-invitation-input";
import { ClinicMembershipRole } from "@prisma/client";
import type { PracticeMemberRow } from "@/lib/clinic-portal/list-practice-members";

const empty: MembershipStatusActionState = {};
const emptyInvite: InvitePracticeMemberState = {};
const DEACTIVATE_PENDING_STATUS = "Deactivating clinic access. Please wait.";
const ACTIVATE_PENDING_STATUS = "Restoring clinic access. Please wait.";
const INVITE_PENDING_STATUS = "Sending invitation. Please wait.";

function memberDisplayName(row: PracticeMemberRow): string {
  return row.name?.trim() || row.email;
}

export function PracticeMembersSection({
  clinicName,
  rows,
  canInvite,
  operatorTeamHref = null,
}: {
  clinicName: string;
  rows: PracticeMemberRow[];
  canInvite: boolean;
  operatorTeamHref?: string | null;
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
  const [inviteState, inviteAction, invitePending] = useActionState(
    invitePracticeMemberAction,
    emptyInvite
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

  useEffect(() => {
    if (inviteState.success) {
      router.refresh();
    }
  }, [inviteState.success, router]);

  return (
    <section
      className="min-w-0 rounded-xl border border-staff-line bg-staff-panel p-5"
      aria-labelledby="practice-members-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2
          id="practice-members-heading"
          className="text-base font-semibold tracking-tight"
        >
          Members
        </h2>
        {operatorTeamHref ? (
          <Link
            href={operatorTeamHref}
            className="staffBtn staffBtnSecondary h-11"
          >
            Manage team
          </Link>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-staff-muted">
        Clinic staff access is per membership. Deactivating someone removes
        access to {clinicName} only. Their River Aftercare account stays intact.
      </p>
      {canInvite ? (
        <InviteMemberForm
          action={inviteAction}
          pending={invitePending}
          state={inviteState}
        />
      ) : null}
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

function InviteMemberForm({
  action,
  pending,
  state,
}: {
  action: (payload: FormData) => void;
  pending: boolean;
  state: InvitePracticeMemberState;
}) {
  const reactId = useId().replace(/:/g, "");
  const nameId = `invite-name-${reactId}`;
  const emailId = `invite-email-${reactId}`;
  const roleId = `invite-role-${reactId}`;

  return (
    <form
      action={action}
      className="mt-4 flex min-w-0 max-w-lg flex-col gap-4"
      noValidate
      aria-busy={pending || undefined}
    >
      <div className="sr-only" role="status" aria-live="polite">
        {pending ? INVITE_PENDING_STATUS : ""}
      </div>
      <fieldset className="flex min-w-0 flex-col gap-4 border-0 p-0">
        <legend className="text-sm font-semibold">Invite member</legend>
        <p className="text-sm leading-6 text-staff-muted">
          We&apos;ll email a one-time setup link. They appear in this list after
          they accept.
        </p>
        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-sm font-medium" htmlFor={nameId}>
            Name
          </label>
          <input
            id={nameId}
            name="name"
            required
            maxLength={INVITED_NAME_MAX_LENGTH}
            disabled={pending}
            autoComplete="name"
            className="staffField"
          />
          {state.fieldErrors?.name ? (
            <p className="text-sm text-red-600">{state.fieldErrors.name}</p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-sm font-medium" htmlFor={emailId}>
            Email
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            required
            maxLength={LOGIN_EMAIL_MAX_LENGTH}
            disabled={pending}
            autoComplete="email"
            className="staffField"
          />
          {state.fieldErrors?.email ? (
            <p className="text-sm text-red-600">{state.fieldErrors.email}</p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-sm font-medium" htmlFor={roleId}>
            Role
          </label>
          <select
            id={roleId}
            name="role"
            required
            disabled={pending}
            defaultValue="STAFF"
            className="staffSelect"
          >
            <option value="ADMIN">{TEAM_ADMIN_ROLE_LABEL}</option>
            <option value="STAFF">{TEAM_STAFF_ROLE_LABEL}</option>
          </select>
          {state.fieldErrors?.role ? (
            <p className="text-sm text-red-600">{state.fieldErrors.role}</p>
          ) : null}
        </div>
      </fieldset>
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-staff-ink" role="status">
          {state.success}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="staffBtn staffBtnPrimary staffLoginSubmit h-11 w-full sm:w-fit"
        aria-busy={pending || undefined}
      >
        {pending ? (
          <span className="staffLoginSpinner" aria-hidden="true" />
        ) : null}
        {pending ? "Sending…" : "Send invitation"}
      </button>
    </form>
  );
}
