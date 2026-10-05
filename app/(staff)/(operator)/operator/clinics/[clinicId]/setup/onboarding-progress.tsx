import type { OnboardingProgressItem } from "@/lib/operator/clinic-onboarding";

export function OnboardingProgressList({
  items,
}: {
  items: readonly OnboardingProgressItem[];
}) {
  return (
    <ol
      className="flex flex-col gap-2 text-sm"
      aria-label="Clinic setup progress"
    >
      {items.map((item) => (
        <li
          key={item.id}
          data-complete={item.complete ? "true" : "false"}
          data-progress-item={item.id}
          className="flex items-center gap-2"
        >
          <span
            aria-hidden="true"
            className={
              item.complete
                ? "w-4 text-center font-semibold text-staff-brand"
                : "w-4 text-center text-staff-muted"
            }
          >
            {item.complete ? "✓" : "○"}
          </span>
          <span className={item.complete ? "font-medium" : "text-staff-muted"}>
            {item.label}
          </span>
          <span className="sr-only">
            {item.complete ? "Complete" : "Not complete"}
          </span>
        </li>
      ))}
    </ol>
  );
}
