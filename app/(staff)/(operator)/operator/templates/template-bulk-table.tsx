"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  TemplateActivityBadge,
  TemplateDraftBadge,
  TemplateOriginBadge,
} from "@/app/(staff)/(operator)/operator/templates/template-badges";
import {
  applyCanonicalTemplateBulkAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";
import {
  bulkTemplateActionAvailability,
  type BulkTemplateAction,
} from "@/lib/operator/canonical-templates/bulk-template-eligibility";

export interface TemplateBulkTableRow {
  id: string;
  title: string;
  slug: string;
  href: string;
  serviceCategoryLabel: string;
  isActive: boolean;
  isSample: boolean;
  latestPublishedVersion: number | null;
  draft: { id: string; version: number } | null;
}

const BULK_ACTIONS: readonly BulkTemplateAction[] = [
  "publish",
  "deactivate",
  "reactivate",
  "delete",
];

const initial: CanonicalTemplateActionState = {};

export function TemplateBulkTable({
  templates,
  filterKey,
}: {
  templates: readonly TemplateBulkTableRow[];
  filterKey: string;
}) {
  const [state, formAction, pending] = useActionState(
    applyCanonicalTemplateBulkAction,
    initial
  );
  const [seenFilter, setSeenFilter] = useState(filterKey);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [confirming, setConfirming] = useState<BulkTemplateAction | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const handled = useRef(state);
  const reasonIds = {
    publish: useId(),
    deactivate: useId(),
    reactivate: useId(),
    delete: useId(),
  };

  if (seenFilter !== filterKey) {
    setSeenFilter(filterKey);
    setSelected(new Set());
  }

  const selectedTemplates = templates.filter((template) =>
    selected.has(template.id)
  );
  const availability = bulkTemplateActionAvailability(selectedTemplates);
  const allSelected =
    templates.length > 0 && selectedTemplates.length === templates.length;
  const partiallySelected = selectedTemplates.length > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = partiallySelected;
    }
  }, [partiallySelected]);

  useEffect(() => {
    if (handled.current === state) {
      return;
    }
    handled.current = state;
    if (state.ok) {
      setSelected(new Set());
    }
    if (state.ok || state.error) {
      setConfirming(null);
    }
  }, [state]);

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleVisible() {
    setSelected(
      allSelected
        ? new Set()
        : new Set(templates.map((template) => template.id))
    );
  }

  function submit(action: BulkTemplateAction) {
    const form = document.getElementById(
      `bulk-${action}-form`
    ) as HTMLFormElement | null;
    form?.requestSubmit();
  }

  const publishPayload = selectedTemplates.map((template) => ({
    templateId: template.id,
    revisionId: template.draft?.id ?? "",
    expectedVersion: template.draft?.version ?? null,
  }));
  const idPayload = selectedTemplates.map((template) => ({
    templateId: template.id,
  }));
  const countLabel =
    selectedTemplates.length === 1
      ? "1 template selected"
      : `${selectedTemplates.length} templates selected`;

  return (
    <div className="flex flex-col gap-4">
      {state.message ? (
        <p className="text-sm text-staff-muted" role="status">
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {selectedTemplates.length > 0 ? (
        <div className="staffBulkBar" role="region" aria-label="Bulk actions">
          <p className="text-sm font-medium">{countLabel}</p>
          <div className="staffBulkBarActions">
            {BULK_ACTIONS.map((action) => {
              const item = availability[action];
              return (
                <button
                  key={action}
                  type="button"
                  className={`staffBtn ${
                    action === "delete" ? "staffBtnDanger" : "staffBtnSecondary"
                  }`}
                  disabled={!item.enabled || pending}
                  aria-describedby={item.reason ? reasonIds[action] : undefined}
                  title={item.reason ?? undefined}
                  onClick={() => setConfirming(action)}
                >
                  {actionLabel(action)}
                </button>
              );
            })}
          </div>
          <div className="staffBulkBarReasons">
            {BULK_ACTIONS.map((action) => {
              const reason = availability[action].reason;
              if (!reason) {
                return null;
              }
              return (
                <p key={action} id={reasonIds[action]}>
                  {reason}
                </p>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="staffOperatorTableWrap">
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">Canonical templates</caption>
          <thead className="border-b border-staff-line text-staff-muted">
            <tr>
              <th className="w-12 px-4 py-3 font-medium">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className="staffOperatorSelect"
                  checked={allSelected}
                  aria-label="Select all visible templates"
                  onChange={toggleVisible}
                />
              </th>
              <th className="px-4 py-3 font-medium">Template</th>
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Latest published</th>
              <th className="px-4 py-3 font-medium">Draft</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr
                key={template.id}
                className="staffOperatorRow border-b border-staff-line last:border-0"
                data-sample={template.isSample ? "true" : "false"}
                data-active={template.isActive ? "true" : "false"}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="staffOperatorSelect"
                    checked={selected.has(template.id)}
                    aria-label={`Select ${template.title}`}
                    onChange={() => toggleOne(template.id)}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link href={template.href} className="staffOperatorRowLink">
                    {template.title}
                  </Link>
                  <p className="text-staff-muted">{template.slug}</p>
                </td>
                <td className="px-4 py-3">{template.serviceCategoryLabel}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <TemplateOriginBadge isSample={template.isSample} />
                    <TemplateActivityBadge isActive={template.isActive} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  {template.latestPublishedVersion === null ? (
                    <span className="text-staff-muted">None</span>
                  ) : (
                    <span className="staffStatusPill" data-tone="published">
                      Published
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {template.draft ? (
                    <TemplateDraftBadge />
                  ) : (
                    <span className="text-staff-muted">None</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BulkForm
        id="bulk-publish-form"
        action={formAction}
        operation="publish"
        payload={publishPayload}
      />
      <BulkForm
        id="bulk-deactivate-form"
        action={formAction}
        operation="deactivate"
        payload={idPayload}
      />
      <BulkForm
        id="bulk-reactivate-form"
        action={formAction}
        operation="reactivate"
        payload={idPayload}
      />
      <BulkForm
        id="bulk-delete-form"
        action={formAction}
        operation="delete"
        payload={idPayload}
      />
      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming ? confirmTitle(confirming, selectedTemplates.length) : ""
        }
        description={confirming ? confirmDescription(confirming) : ""}
        cancelLabel="Cancel"
        confirmLabel={confirming ? actionLabel(confirming) : "Confirm"}
        confirmTone={
          confirming === "deactivate" || confirming === "delete"
            ? "danger"
            : "primary"
        }
        pending={pending}
        pendingLabel={confirming ? pendingLabel(confirming) : undefined}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) {
            submit(confirming);
          }
        }}
      >
        <ul className="staffBulkNames">
          {selectedTemplates.map((template) => (
            <li key={template.id}>{template.title}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  );
}

function BulkForm({
  id,
  action,
  operation,
  payload,
}: {
  id: string;
  action: (formData: FormData) => void;
  operation: BulkTemplateAction;
  payload: readonly object[];
}) {
  return (
    <form id={id} action={action} className="hidden">
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="templates" value={JSON.stringify(payload)} />
    </form>
  );
}

function actionLabel(action: BulkTemplateAction): string {
  if (action === "publish") {
    return "Publish";
  }
  if (action === "deactivate") {
    return "Deactivate";
  }
  if (action === "reactivate") {
    return "Reactivate";
  }
  return "Delete";
}

function confirmTitle(action: BulkTemplateAction, count: number): string {
  const noun = count === 1 ? "template" : "templates";
  return `${actionLabel(action)} ${count} ${noun}?`;
}

function confirmDescription(action: BulkTemplateAction): string {
  if (action === "publish") {
    return "Each selected draft will become an immutable published revision.";
  }
  if (action === "deactivate") {
    return "They stop being offered for new clinic adoption. Existing clinic guides and pins remain unchanged.";
  }
  if (action === "reactivate") {
    return "Eligible clinics can discover the latest published revision again. Existing clinic pins are not changed.";
  }
  return "This permanently removes each never-published template and its unpublished draft.";
}

function pendingLabel(action: BulkTemplateAction): string {
  if (action === "publish") {
    return "Publishing…";
  }
  if (action === "deactivate") {
    return "Deactivating…";
  }
  if (action === "reactivate") {
    return "Reactivating…";
  }
  return "Deleting…";
}
