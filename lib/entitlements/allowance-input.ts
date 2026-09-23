/** PostgreSQL integer upper bound. This is not a commercial price cap. */
export const MAX_OPERATOR_EXTRA_ALLOWANCE = 2_147_483_647;

/**
 * Parses one operator extra allowance.
 * Returns null for empty, decimal, negative, non-numeric, non-finite,
 * and out-of-range values. Does not coerce invalid text to zero.
 */
export function parseOperatorExtraAllowance(raw: unknown): number | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value > MAX_OPERATOR_EXTRA_ALLOWANCE) {
    return null;
  }
  return value;
}

export function operatorExtraAllowanceError(raw: string): string | null {
  return parseOperatorExtraAllowance(raw) === null
    ? "Enter a whole number of zero or more."
    : null;
}
