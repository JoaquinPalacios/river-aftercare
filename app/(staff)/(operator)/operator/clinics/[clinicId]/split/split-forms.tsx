"use client";

import { useActionState } from "react";

import {
  cancelSplitPreparationAction,
  createSplitPreparationAction,
  createSplitShellAction,
  executeSplitAction,
  saveSplitSiteDecisionsAction,
  saveSplitStaffAction,
  updateSplitTargetAction,
  type SplitActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/split/actions";

const initial: SplitActionState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p className="text-sm text-red-600" role="alert">
      {message}
    </p>
  );
}

export function CreateSplitPreparationForm({
  sourceClinicId,
  sites,
}: {
  sourceClinicId: string;
  sites: Array<{
    id: string;
    displayName: string;
    slug: string;
    active: boolean;
    isPrimary: boolean;
  }>;
}) {
  const [state, action, pending] = useActionState(
    createSplitPreparationAction,
    initial
  );
  const activeSites = sites.filter((site) => site.active);
  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="sourceClinicId" value={sourceClinicId} />
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">
          Site that stays on the source Account
        </span>
        <select
          name="keptClinicSiteId"
          required
          defaultValue=""
          className="h-11 rounded-md border border-staff-line bg-staff-panel px-3"
        >
          <option value="" disabled>
            Choose a site
          </option>
          {activeSites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.displayName} · {site.slug}
              {site.isPrimary ? " · primary" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Destination plan</span>
          <select
            name="destinationPlan"
            required
            defaultValue="PRACTICE"
            className="h-11 rounded-md border border-staff-line bg-staff-panel px-3"
          >
            <option value="PRACTICE">Practice</option>
            <option value="ESSENTIAL">Essential</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Destination billing</span>
          <select
            name="destinationBillingInterval"
            required
            defaultValue="MONTHLY"
            className="h-11 rounded-md border border-staff-line bg-staff-panel px-3"
          >
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </label>
      </div>
      <FieldError message={state.error} />
      <button
        type="submit"
        disabled={pending}
        className="staffBtn staffBtnPrimary w-fit"
      >
        {pending ? "Starting…" : "Start preparation"}
      </button>
    </form>
  );
}

export function SplitSiteDecisionsForm({
  sourceClinicId,
  preparationId,
  sites,
}: {
  sourceClinicId: string;
  preparationId: string;
  sites: Array<{
    id: string;
    displayName: string;
    slug: string;
    active: boolean;
    decision: "SPLIT" | "DEACTIVATE" | "RETAIN_ON_SOURCE" | null;
  }>;
}) {
  const [state, action, pending] = useActionState(
    saveSplitSiteDecisionsAction,
    initial
  );
  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="sourceClinicId" value={sourceClinicId} />
      <input type="hidden" name="preparationId" value={preparationId} />
      {sites.map((site) => (
        <fieldset
          key={site.id}
          className="rounded-lg border border-staff-line p-3"
        >
          <legend className="px-1 text-sm font-medium">
            {site.displayName} · {site.slug}
            {site.active ? "" : " · inactive"}
          </legend>
          <input type="hidden" name="siteId" value={site.id} />
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name={`decision:${site.id}`}
                value="SPLIT"
                defaultChecked={site.decision === "SPLIT"}
                required
              />
              Split to the new Account
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name={`decision:${site.id}`}
                value="DEACTIVATE"
                defaultChecked={site.decision === "DEACTIVATE"}
                required
              />
              Deactivate
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name={`decision:${site.id}`}
                value="RETAIN_ON_SOURCE"
                defaultChecked={site.decision === "RETAIN_ON_SOURCE"}
                required
              />
              Keep active on the source Account
            </label>
          </div>
        </fieldset>
      ))}
      <FieldError message={state.error} />
      <button
        type="submit"
        disabled={pending}
        className="staffBtn staffBtnPrimary w-fit"
      >
        {pending ? "Saving…" : "Save site decisions"}
      </button>
    </form>
  );
}

export function SplitStaffForm({
  sourceClinicId,
  preparationId,
  members,
}: {
  sourceClinicId: string;
  preparationId: string;
  members: Array<{
    userId: string;
    name: string | null;
    email: string;
    role: "ADMIN" | "STAFF";
    placement: "source" | "destination" | null;
    destinationRole: "ADMIN" | "STAFF";
  }>;
}) {
  const [state, action, pending] = useActionState(
    saveSplitStaffAction,
    initial
  );
  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="sourceClinicId" value={sourceClinicId} />
      <input type="hidden" name="preparationId" value={preparationId} />
      {members.map((member) => (
        <fieldset
          key={member.userId}
          className="rounded-lg border border-staff-line p-3"
        >
          <legend className="px-1 text-sm font-medium">
            {member.name ?? member.email}
          </legend>
          <p className="text-sm text-staff-muted">{member.email}</p>
          <input type="hidden" name="userId" value={member.userId} />
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name={`placement:${member.userId}`}
                value="source"
                defaultChecked={member.placement !== "destination"}
                required
              />
              Source only
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name={`placement:${member.userId}`}
                value="destination"
                defaultChecked={member.placement === "destination"}
                required
              />
              Destination only
            </label>
          </div>
          <label className="mt-3 flex flex-col gap-2 text-sm">
            <span className="font-medium">Destination role</span>
            <select
              name={`role:${member.userId}`}
              defaultValue={member.destinationRole}
              className="h-11 rounded-md border border-staff-line bg-staff-panel px-3"
            >
              <option value="ADMIN">Administrator</option>
              <option value="STAFF">Staff</option>
            </select>
          </label>
        </fieldset>
      ))}
      <FieldError message={state.error} />
      <button
        type="submit"
        disabled={pending}
        className="staffBtn staffBtnPrimary w-fit"
      >
        {pending ? "Saving…" : "Save staff decisions"}
      </button>
    </form>
  );
}

export function SplitTargetForm({
  sourceClinicId,
  preparationId,
  plan,
  interval,
}: {
  sourceClinicId: string;
  preparationId: string;
  plan: "ESSENTIAL" | "PRACTICE";
  interval: "MONTHLY" | "YEARLY";
}) {
  const [state, action, pending] = useActionState(
    updateSplitTargetAction,
    initial
  );
  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="sourceClinicId" value={sourceClinicId} />
      <input type="hidden" name="preparationId" value={preparationId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Destination plan</span>
          <select
            name="destinationPlan"
            defaultValue={plan}
            className="h-11 rounded-md border border-staff-line bg-staff-panel px-3"
          >
            <option value="PRACTICE">Practice</option>
            <option value="ESSENTIAL">Essential</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Destination billing</span>
          <select
            name="destinationBillingInterval"
            defaultValue={interval}
            className="h-11 rounded-md border border-staff-line bg-staff-panel px-3"
          >
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </label>
      </div>
      <FieldError message={state.error} />
      <button type="submit" disabled={pending} className="staffBtn w-fit">
        {pending ? "Saving…" : "Save destination target"}
      </button>
    </form>
  );
}

export function CreateSplitShellForm({
  sourceClinicId,
  preparationId,
  disabled,
}: {
  sourceClinicId: string;
  preparationId: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    createSplitShellAction,
    initial
  );
  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="sourceClinicId" value={sourceClinicId} />
      <input type="hidden" name="preparationId" value={preparationId} />
      <FieldError message={state.error} />
      <button
        type="submit"
        disabled={pending || disabled}
        className="staffBtn staffBtnPrimary w-fit"
      >
        {pending ? "Creating…" : "Create destination shell"}
      </button>
    </form>
  );
}

export function ExecuteSplitForm({
  sourceClinicId,
  preparationId,
  confirmationPhrase,
}: {
  sourceClinicId: string;
  preparationId: string;
  confirmationPhrase: string;
}) {
  const [state, action, pending] = useActionState(executeSplitAction, initial);
  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="sourceClinicId" value={sourceClinicId} />
      <input type="hidden" name="preparationId" value={preparationId} />
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">
          Type <span className="font-mono">{confirmationPhrase}</span> to
          execute
        </span>
        <input
          name="confirmation"
          required
          autoComplete="off"
          spellCheck={false}
          className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 font-mono"
        />
      </label>
      <FieldError message={state.error} />
      <button
        type="submit"
        disabled={pending}
        className="staffBtn staffBtnPrimary w-fit"
      >
        {pending ? "Executing…" : "Execute split"}
      </button>
    </form>
  );
}

export function CancelSplitPreparationForm({
  sourceClinicId,
  preparationId,
}: {
  sourceClinicId: string;
  preparationId: string;
}) {
  const [state, action, pending] = useActionState(
    cancelSplitPreparationAction,
    initial
  );
  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="sourceClinicId" value={sourceClinicId} />
      <input type="hidden" name="preparationId" value={preparationId} />
      <FieldError message={state.error} />
      <button type="submit" disabled={pending} className="staffBtn w-fit">
        {pending ? "Cancelling…" : "Cancel preparation"}
      </button>
    </form>
  );
}
