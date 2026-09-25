import type {
  ClinicGuideLifecycleStatus,
  GuideStatusPill,
} from "@/lib/clinic-portal/guide-status-view";
import { clinicGuideStatusPills } from "@/lib/clinic-portal/guide-status-view";

export function GuideStatusPills({
  lifecycle,
  pills,
}: {
  lifecycle?: ClinicGuideLifecycleStatus;
  pills?: GuideStatusPill[];
}) {
  const items = pills ?? (lifecycle ? clinicGuideStatusPills(lifecycle) : []);
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="staffStatusPills">
      {items.map((pill) => (
        <li key={pill.label} className="staffStatusPill" data-tone={pill.tone}>
          {pill.label}
        </li>
      ))}
    </ul>
  );
}
