"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";

export function CanonicalEditorToolbar({
  templateId,
  templateTitle,
  mode = "draft",
  contentChanged,
  saving,
  publishing,
  editing = false,
  isActive,
  onPublish,
  lifecycle,
}: {
  templateId: string;
  templateTitle: string;
  mode?: "draft" | "published";
  contentChanged: boolean;
  saving: boolean;
  publishing: boolean;
  editing?: boolean;
  isActive: boolean;
  onPublish: () => void;
  lifecycle: ReactNode;
}) {
  const published = mode === "published";
  return (
    <div className="canonicalEditorToolbar" data-canonical-toolbar="">
      <div className="canonicalEditorToolbarStart">
        <PortalBreadcrumb
          items={
            published
              ? [
                  { href: "/operator/templates", label: "Templates" },
                  { label: templateTitle },
                ]
              : [
                  { href: "/operator/templates", label: "Templates" },
                  {
                    href: `/operator/templates/${templateId}`,
                    label: templateTitle,
                  },
                  { label: "Draft" },
                ]
          }
        />
        <div className="canonicalEditorToolbarStatus">
          {published ? (
            <span className="staffStatusPill" data-tone="published">
              Published
            </span>
          ) : (
            <span className="staffStatusPill" data-tone="draft">
              Draft
            </span>
          )}
          {published || !contentChanged ? null : (
            <span className="staffStatusPill" data-tone="warning">
              Unsaved changes
            </span>
          )}
          {isActive ? null : (
            <span className="staffStatusPill" data-tone="inactive">
              Inactive
            </span>
          )}
        </div>
        {published ? (
          <p className="canonicalEditorEditNote" id="published-edit-note">
            Creates a new editable revision. The published version remains
            unchanged until you publish the new draft.
          </p>
        ) : null}
      </div>
      <div className="canonicalEditorToolbarActions">
        {published ? (
          <button
            type="submit"
            form="create-published-revision-form"
            className="staffBtn staffBtnPrimary"
            aria-describedby="published-edit-note"
            disabled={editing}
          >
            {editing ? "Opening…" : "Edit"}
          </button>
        ) : (
          <>
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
          </>
        )}
        <Link
          href={`/operator/templates/${templateId}`}
          className="staffBtn staffBtnSecondary"
        >
          Details
        </Link>
        {lifecycle}
      </div>
    </div>
  );
}
