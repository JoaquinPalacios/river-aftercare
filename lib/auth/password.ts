import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { PASSWORD_MAX_LENGTH } from "@/lib/auth/login-input";

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_KEY_LENGTH = 64;

/**
 * Public dummy scrypt hash used only to spend one verification when a login
 * attempt has no stored password hash (unknown email or `passwordHash = null`).
 *
 * This value is not a secret, is not loaded from the environment, and must
 * never grant a session. Matching it is ignored by the login route.
 */
export const DUMMY_PASSWORD_HASH =
  "scrypt:d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1:b764263f250e4fa67ae2dd66f77a6191da1f1f55565f2be3179b798e8480fa3f9c79b59416454a23bf39038fd972c5cb0ffa7b7727966c03dbd35de0c00fba03";

export function hashPassword(password: string): string {
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(
      `Password exceeds the ${PASSWORD_MAX_LENGTH}-character resource-safety limit.`
    );
  }

  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `${SCRYPT_PREFIX}:${salt}:${hash}`;
}

export function verifyPassword(
  password: string,
  passwordHash: string | null | undefined
) {
  if (password.length > PASSWORD_MAX_LENGTH) {
    return false;
  }

  if (!passwordHash) {
    return false;
  }

  const [algorithm, salt, storedHash] = passwordHash.split(":");

  if (!algorithm || !salt || !storedHash || algorithm !== SCRYPT_PREFIX) {
    return false;
  }

  const derivedHash = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const storedHashBuffer = Buffer.from(storedHash, "hex");

  if (storedHashBuffer.length !== derivedHash.length) {
    return false;
  }

  return timingSafeEqual(derivedHash, storedHashBuffer);
}
