import Link from "next/link";

import type { OperatorClinicActivity } from "@/lib/operator/list-operator-clinics";

const TABS: readonly {
  activity: OperatorClinicActivity;
  href: string;
  label: string;
}[] = [
  { activity: "active", href: "/operator/clinics", label: "Active" },
  {
    activity: "inactive",
    href: "/operator/clinics?activity=inactive",
    label: "Inactive",
  },
  {
    activity: "archived",
    href: "/operator/clinics?activity=archived",
    label: "Archived",
  },
];

export function operatorClinicListActivity(
  activity: string | undefined
): OperatorClinicActivity {
  if (activity === "inactive" || activity === "archived") {
    return activity;
  }
  return "active";
}

export function ClinicActivityTabs({
  activity,
}: {
  activity: OperatorClinicActivity;
}) {
  return (
    <nav className="staffActivityTabs" aria-label="Clinic activity">
      {TABS.map((tab) => {
        const selected = tab.activity === activity;
        return (
          <Link
            key={tab.activity}
            href={tab.href}
            className="staffActivityTab"
            aria-current={selected ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
