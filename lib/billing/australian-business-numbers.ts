import "server-only";

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;
const ACN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidAbn(value: string): boolean {
  const digits = digitsOnly(value);
  if (!/^\d{11}$/.test(digits)) {
    return false;
  }

  const numbers = digits.split("").map((digit) => Number(digit));
  numbers[0] -= 1;
  const sum = numbers.reduce(
    (total, digit, index) => total + digit * ABN_WEIGHTS[index],
    0
  );
  return sum % 89 === 0;
}

export function isValidAcn(value: string): boolean {
  const digits = digitsOnly(value);
  if (!/^\d{9}$/.test(digits)) {
    return false;
  }

  const numbers = digits.split("").map((digit) => Number(digit));
  const sum = numbers
    .slice(0, 8)
    .reduce((total, digit, index) => total + digit * ACN_WEIGHTS[index], 0);
  const remainder = sum % 10;
  const checkDigit = remainder === 0 ? 0 : 10 - remainder;
  return numbers[8] === checkDigit;
}

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
