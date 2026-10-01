export function canViewCommercialBillingNotices(input: {
  role: "ADMIN" | "STAFF" | null;
  source?: "membership" | "operator_support";
}): boolean {
  if (input.source === "operator_support") {
    return true;
  }
  return input.role === "ADMIN";
}
