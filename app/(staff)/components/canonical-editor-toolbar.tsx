"use client";

import type { ReactNode } from "react";

import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";

export function CanonicalEditorToolbar({
  templateId,
  templateTitle,
  version,
  contentChanged,
  saving,
  publishing,
  isActive,
  onPublish,
  lifecycle,
}: {
  templateId: string;
  templateTitle: string;
  version: number;
  contentChanged: boolean;
  saving: boolean;
  publishing: boolean;
  isActive: boolean;
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
          className="staffBtn staffBtnSecondary"
          data-draft-save="toolbar"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="staffBtn staffBtnPrimary"
          disabled={publishing}
          onClick={onPublish}
        >
          {publishing ? "Publishing…" : "Publish"}
        </button>
        {lifecycle}
      </div>
    </div>
  );
}
