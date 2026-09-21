import type { Metadata } from "next";
import Link from "next/link";

import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import {
  type ClinicProcedureTemplateListItem,
  listActiveClinicProcedureTemplates,
} from "@/lib/procedures/list-clinic-templates";

export const metadata: Metadata = {
  title: "Procedure templates",
  description:
    "Read-only view of active procedure templates for the signed-in clinic.",
};

export default async function DashboardProceduresPage() {
  const { clinicMembership } = await requireStaffSession();
  await enforcePrePaymentActivationGate(clinicMembership);
  // `requireStaffSession` redirects when clinic membership is missing, so the
  // protected dashboard shell guarantees a non-null value here. We rely on
  // that invariant rather than adding a second per-page redirect branch.
  const clinic = clinicMembership!.clinic;

  const templates = await listActiveClinicProcedureTemplates(clinic.id);

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <header className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-zinc-500">
          {clinic.name}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
          Procedure templates
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Read-only view of active procedure templates for your clinic. This
          page is for internal inspection only; editing, publishing, and session
          creation are not available here.
        </p>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          <Link
            className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
            href="/dashboard"
          >
            Back to dashboard
          </Link>
        </p>
      </header>

      {templates.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-6">
          {templates.map((template) => (
            <li key={template.id}>
              <ProcedureTemplateCard template={template} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-sm leading-6 text-zinc-600 shadow-sm">
      No active procedure templates are configured for this clinic yet.
    </div>
  );
}

function ProcedureTemplateCard({
  template,
}: {
  template: ClinicProcedureTemplateListItem;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
            {template.name}
          </h2>
          {template.isActive ? (
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Active
            </span>
          ) : null}
        </div>
        <p className="text-xs text-zinc-500">
          <span className="font-mono">{template.slug}</span>
        </p>
      </div>

      <section className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Selected-area options
        </h3>
        {template.selectedAreaOptions.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No active selected-area options configured.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {template.selectedAreaOptions.map((option) => (
              <li
                key={option.key}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700"
                title={`key: ${option.key}`}
              >
                <span className="font-medium text-zinc-900">
                  {option.label}
                </span>
                <span className="font-mono text-[10px] text-zinc-500">
                  {option.key}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Stages
        </h3>
        {template.stageTemplates.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No stages configured for this template.
          </p>
        ) : (
          <ol className="mt-3 space-y-4">
            {template.stageTemplates.map((stage) => (
              <li
                key={stage.stageOrder}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-5"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Stage {stage.stageOrder}
                  </span>
                  <h4 className="text-base font-semibold text-zinc-950">
                    {stage.title}
                  </h4>
                  {stage.defaultDurationHint ? (
                    <span className="text-xs text-zinc-500">
                      &middot; {stage.defaultDurationHint}
                    </span>
                  ) : null}
                </div>

                <dl className="mt-3 space-y-3 text-sm leading-6 text-zinc-700">
                  <StageCopyRow label="Calm" value={stage.calmCopy} />
                  <StageCopyRow label="Patient" value={stage.patientCopy} />
                  <StageCopyRow label="Detailed" value={stage.detailedCopy} />
                </dl>

                {stage.illustrationUrl ? (
                  <p className="mt-3 text-xs text-zinc-500">
                    Illustration:{" "}
                    <a
                      href={stage.illustrationUrl}
                      className="font-mono text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
                      rel="noreferrer"
                      target="_blank"
                    >
                      {stage.illustrationUrl}
                    </a>
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}

function StageCopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
        {value}
      </dd>
    </div>
  );
}
