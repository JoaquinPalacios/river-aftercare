"use client";

import type { ReactNode } from "react";

import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";

export function CanonicalEditorToolbar({
  templateId,
  templateTitle,
  version,
  reviewed,
  contentChanged,
  saving,
  publishing,
  isActive,
  invalidationWarningId,
  onRecordReview,
  onPublish,
  lifecycle,
}: {
  templateId: string;
  templateTitle: string;
  version: number;
  reviewed: boolean;
  contentChanged: boolean;
  saving: boolean;
  publishing: boolean;
  isActive: boolean;
  invalidationWarningId?: string;
  onRecordReview: () => void;
  onPublish: () => void;
  lifecycle: ReactNode;
}) {
  return (
    <div className="canonicalEditorToolbar" data-canonical-toolbar="">
      <div className="canonicalEditorToolbarStart">
        <PortalBreadcrumb
          items={[
            { href: "/operator/templates", label: "Templates" },
            {
              href: `/operator/templates/${templateId}`,
              label: templateTitle,
            },
            { label: `Draft v${version}` },
          ]}
        />
        <div className="canonicalEditorToolbarStatus">
          <span className="staffStatusPill" data-tone="draft">
            Draft v{version}
          </span>
          {reviewed ? (
            <span className="staffStatusPill" data-tone="success">
              Review recorded
            </span>
          ) : (
            <span className="staffStatusPill" data-tone="warning">
              Not reviewed
            </span>
          )}
          {contentChanged ? (
            <span className="staffStatusPill" data-tone="warning">
              Unsaved changes
            </span>
          ) : null}
          {isActive ? null : (
            <span className="staffStatusPill" data-tone="inactive">
              Inactive
            </span>
          )}
        </div>
      </div>
      <div className="canonicalEditorToolbarActions">
        <button
          type="submit"
          form="canonical-draft-form"
          className="staffBtn staffBtnPrimary"
          data-draft-save="toolbar"
          disabled={saving}
          aria-describedby={invalidationWarningId}
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          className="staffBtn staffBtnSecondary"
          onClick={onRecordReview}
        >
          {reviewed ? "Review recorded" : "Record review"}
        </button>
        <button
          type="button"
          className="staffBtn staffBtnPrimary"
          disabled={!reviewed || publishing}
          onClick={onPublish}
        >
          {publishing ? "Publishing…" : "Publish revision"}
        </button>
        {lifecycle}
      </div>
    </div>
  );
}
