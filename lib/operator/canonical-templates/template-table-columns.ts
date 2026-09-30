import type { TableColumnDefinition } from "@/lib/staff/table-controls";

export const OPERATOR_TEMPLATE_COLUMNS = [
  {
    id: "template",
    label: "Template",
    required: true,
    defaultVisible: true,
    sortable: true,
  },
  {
    id: "service",
    label: "Service",
    required: false,
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
    id: "published",
    label: "Latest published",
    required: false,
    defaultVisible: true,
    sortable: false,
  },
  {
    id: "draft",
    label: "Draft",
    required: false,
    defaultVisible: true,
    sortable: false,
  },
] as const satisfies readonly TableColumnDefinition[];

export const OPERATOR_TEMPLATE_LOCKED_COLUMNS =
  "Template and Status are always shown.";
