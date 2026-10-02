"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { WorkspaceLiveDemoUpdate } from "@/app/(staff)/(operator)/operator/templates/template-demo-adoption";
import { TemplateOriginBadge } from "@/app/(staff)/(operator)/operator/templates/template-badges";
import {
  liveDemoCurrency,
  liveDemoCurrencyLabel,
} from "@/lib/demo-adoption/live-demo-currency";
import type { DesignatedDemoAdoptionView } from "@/lib/demo-adoption/load-designated-demo-adoption";

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
  previewHref,
  isSample = false,
  demoAdoption = null,
  demoPublicUrl = null,
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
  previewHref?: string;
  isSample?: boolean;
  demoAdoption?: DesignatedDemoAdoptionView | null;
  demoPublicUrl?: string | null;
}) {
  const published = mode === "published";
  const designatedDemo = published && isSample ? demoAdoption : null;
  const demoCurrency = designatedDemo ? liveDemoCurrency(designatedDemo) : null;
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
          <TemplateOriginBadge isSample={isSample} />
          {published ? (
            <span className="staffStatusPill" data-tone="published">
              Published
            </span>
          ) : (
            <span className="staffStatusPill" data-tone="draft">
              Draft
            </span>
          )}
          {demoCurrency ? (
            <p
              className="canonicalEditorEditNote"
              data-live-demo-currency={demoCurrency}
            >
              {liveDemoCurrencyLabel(demoCurrency)}
            </p>
          ) : null}
          {designatedDemo?.blocker ? (
            <p className="canonicalEditorEditNote" role="status">
              {designatedDemo.blocker}
            </p>
          ) : null}
          {published || !contentChanged ? null : (
            <span className="staffStatusPill" data-tone="warning">
              Unsaved changes
            </span>
          )}
          {published || !contentChanged ? null : (
            <p
              className="canonicalEditorEditNote"
              id="canonical-publish-needs-save"
            >
              Save the current draft before publishing.
            </p>
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
              disabled={publishing || contentChanged}
              aria-describedby={
                contentChanged ? "canonical-publish-needs-save" : undefined
              }
              title={
                contentChanged
                  ? "Save the current draft before publishing."
                  : undefined
              }
              onClick={onPublish}
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </>
        )}
        {designatedDemo ? (
          <WorkspaceLiveDemoUpdate
            templateId={templateId}
            adoption={designatedDemo}
            publicUrl={demoPublicUrl}
          />
        ) : null}
        {previewHref ? (
          <Link href={previewHref} className="staffBtn staffBtnSecondary">
            Preview patient guide
          </Link>
        ) : null}
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
