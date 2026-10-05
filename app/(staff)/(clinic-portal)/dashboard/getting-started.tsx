import Link from "next/link";

import type { OwnerSetupSummary } from "@/lib/clinic-portal/owner-setup";

export function GettingStarted({ summary }: { summary: OwnerSetupSummary }) {
  return (
    <section
      aria-labelledby="getting-started-heading"
      className="rounded-xl border border-staff-line bg-staff-panel p-5 shadow-sm"
      data-owner-setup="getting-started"
      data-ready={summary.ready ? "true" : "false"}
    >
      <h2
        id="getting-started-heading"
        className="text-base font-semibold tracking-tight"
      >
        Getting started
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-staff-muted">
        {summary.ready
          ? "Practice details, contact, emergency guidance, and a published guide are in place."
          : "Finish the remaining practice details, then preview and publish the first guide. The rest of the portal stays available."}
      </p>
      <ul className="mt-4 divide-y divide-staff-line">
        {summary.items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
            data-setup-item={item.id}
            data-state={item.state}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.label}</p>
              <p className="mt-1 text-sm text-staff-muted">{item.detail}</p>
              {item.actions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.actions.map((action) => (
                    <Link
                      key={action.label}
                      href={action.href}
                      className="staffBtn staffBtnSecondary"
                      data-setup-action={action.label}
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            <p
              className="staffStatusPill mt-1 h-7 shrink-0 px-2.5"
              data-tone={item.state === "configured" ? "success" : "warning"}
            >
              {item.state === "configured" ? "Configured" : "Needs attention"}
            </p>
          </li>
        ))}
      </ul>
      {summary.showTemplateCatalogue ? (
        <div className="mt-5 border-t border-staff-line pt-4">
          <h3 className="text-sm font-semibold">Templates for this clinic</h3>
          <ul className="mt-3 flex flex-col gap-4">
            {summary.templateGroups.map((group) => (
              <li key={group.serviceCategory}>
                <p className="text-sm font-medium">{group.label}</p>
                {group.templates.length === 0 ? (
                  <p
                    className="mt-1 text-sm text-staff-muted"
                    data-empty-category={group.serviceCategory}
                  >
                    No published template is available for {group.label}.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {group.templates.map((template) => (
                      <li
                        key={template.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        data-template={template.id}
                        data-template-category={template.serviceCategory}
                      >
                        <span>{template.title}</span>
                        {template.alreadyAdded ? (
                          <span className="text-staff-muted">Added</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
