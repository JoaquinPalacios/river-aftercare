import type { TableColumnDefinition } from "@/lib/staff/table-controls";

export const CLINIC_GUIDE_COLUMNS = [
  {
    id: "guide",
    label: "Guide",
    required: true,
    defaultVisible: true,
    sortable: true,
  },
  {
    id: "status",
    label: "Status",
    required: true,
    defaultVisible: true,
    sortable: true,
  },
  {
    id: "source",
    label: "Source",
    required: false,
    defaultVisible: true,
    sortable: false,
  },
  {
    id: "updated",
    label: "Updated",
    required: false,
    defaultVisible: true,
    sortable: true,
  },
] as const satisfies readonly TableColumnDefinition[];

export const CLINIC_GUIDE_LOCKED_COLUMNS = "Guide and Status are always shown.";
