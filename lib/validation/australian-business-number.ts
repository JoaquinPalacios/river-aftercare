const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;
const ACN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export const INVALID_ABN_MESSAGE = "Enter a valid 11-digit ABN.";

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Australian Business Number check.
 * Spaces and other separators are ignored. The remaining value must be 11
 * digits and pass the ABR modulus-89 checksum (first digit minus 1, then the
 * weighted sum). This does not look up the ABR register.
 */
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
