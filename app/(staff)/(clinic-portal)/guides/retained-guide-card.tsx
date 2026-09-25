import { CopyPatientLinkButton } from "@/app/(staff)/(clinic-portal)/guides/copy-patient-link-button";
import { RetainedGuideRestoreForm } from "@/app/(staff)/(clinic-portal)/guides/retained-guide-restore-form";
import { GuideStatusPills } from "@/app/(staff)/components/guide-status-pills";
import { ExternalLinkIcon } from "@/app/(staff)/components/icons";
import {
  clinicGuideStatusPills,
  type ClinicGuideLifecycleStatus,
  type GuideStatusPill,
} from "@/lib/clinic-portal/guide-status-view";

export function retainedGuideIsPublic(lifecycle: ClinicGuideLifecycleStatus) {
  return lifecycle !== "draft" && lifecycle !== "unpublished";
}

export function RetainedGuideCard({
  guideId,
  title,
  sourceLabel,
  lifecycle,
  retentionUntilLabel,
  retentionUntilIso,
  patientUrl,
  canRestore,
}: {
  guideId: string;
  title: string;
  sourceLabel: string;
  lifecycle: ClinicGuideLifecycleStatus;
  retentionUntilLabel: string;
  retentionUntilIso: string;
  patientUrl: string | null;
  canRestore: boolean;
}) {
  const liveUrl =
    patientUrl && retainedGuideIsPublic(lifecycle) ? patientUrl : null;
  const pills: GuideStatusPill[] = [
    { label: "Retained", tone: "warning" },
    ...clinicGuideStatusPills(lifecycle),
    { label: "Read-only", tone: "inactive" },
  ];

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="font-medium text-staff-ink">{title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <GuideStatusPills pills={pills} />
          <p className="text-sm text-staff-muted">{sourceLabel}</p>
        </div>
      </div>
      <p className="text-sm text-staff-ink">
        Retained until{" "}
        <time dateTime={retentionUntilIso}>{retentionUntilLabel}</time>
      </p>
      <p className="text-sm leading-6 text-staff-muted">
        This guide is read-only while it is retained.
      </p>
      {liveUrl ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm font-medium text-staff-ink">
            Live patient page
          </p>
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              title={liveUrl}
              className="inline-flex min-w-0 max-w-full items-center gap-1 text-sm underline"
            >
              <span className="min-w-0 truncate">{liveUrl}</span>
              <ExternalLinkIcon className="shrink-0" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <CopyPatientLinkButton url={liveUrl} />
          </div>
          <p className="max-w-xl text-sm leading-6 text-staff-muted">
            This published page remains available until {retentionUntilLabel}{" "}
            unless you restore the guide. After that date it will no longer be
            accessible.
          </p>
        </div>
      ) : retainedGuideIsPublic(lifecycle) ? (
        <p className="max-w-xl text-sm leading-6 text-staff-muted">
          This guide has no live patient page.
        </p>
      ) : (
        <p className="max-w-xl text-sm leading-6 text-staff-muted">
          This guide is unpublished. It has no live patient page.
        </p>
      )}
      {canRestore ? <RetainedGuideRestoreForm guideId={guideId} /> : null}
    </li>
  );
}
