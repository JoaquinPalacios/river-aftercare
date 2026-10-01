import "server-only";

import {
  digitsOnly,
  isValidAbn,
  isValidAcn,
} from "@/lib/validation/australian-business-number";

export { digitsOnly, isValidAbn, isValidAcn };

export type AustralianBusinessIdentity = {
  abn: string | null;
  acn: string | null;
};

/**
 * Persistence helper: ABN and ACN are independently optional. Both may be
 * absent. Both should not be required. Invalid formats are rejected when a
 * value is supplied.
 */
export function parseAustralianBusinessIdentity(input: {
  abn?: string | null;
  acn?: string | null;
}): AustralianBusinessIdentity | { error: string } {
  const rawAbn = input.abn?.trim() || "";
  const rawAcn = input.acn?.trim() || "";

  if (rawAbn && !isValidAbn(rawAbn)) {
    return { error: "ABN is not a valid 11-digit Australian Business Number." };
  }
  if (rawAcn && !isValidAcn(rawAcn)) {
    return { error: "ACN is not a valid 9-digit Australian Company Number." };
  }

  return {
    abn: rawAbn ? digitsOnly(rawAbn) : null,
    acn: rawAcn ? digitsOnly(rawAcn) : null,
  };
}
