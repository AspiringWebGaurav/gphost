import { argon2id } from "hash-wasm";
import crypto from "node:crypto";

export const PASSWORD_PEPPER =
  process.env.PASSWORD_PEPPER ||
  process.env.PIN_PEPPER ||
  (process.env.NODE_ENV !== "production" ? "gphost_dev_password_pepper" : "");

/**
 * Validates that a share password is a non-empty string up to 128 characters.
 */
export function isValidPasswordFormat(password: unknown): password is string {
  return typeof password === "string" && password.length >= 1 && password.length <= 128;
}

/**
 * Generates a cryptographically random 16-byte hex salt for a share password.
 */
export function generatePasswordSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Computes an Argon2id hash for a share password combined with server pepper and random salt.
 */
export async function hashSharePassword(
  password: string,
  saltHex: string,
  pepper = PASSWORD_PEPPER
): Promise<string> {
  if (!isValidPasswordFormat(password)) {
    throw new Error("Invalid password format: must be between 1 and 128 characters");
  }

  const salt = Buffer.from(saltHex, "hex");

  return await argon2id({
    password: password + pepper,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 64 * 1024, // 64 MB
    hashLength: 32,
    outputType: "hex",
  });
}

/**
 * Verifies a share password against an expected hash using constant-time comparison.
 */
export async function verifySharePassword(
  password: string,
  saltHex: string,
  expectedHashHex: string,
  pepper = PASSWORD_PEPPER
): Promise<boolean> {
  if (!isValidPasswordFormat(password)) {
    return false;
  }

  try {
    const calculatedHash = await hashSharePassword(password, saltHex, pepper);
    const bufA = Buffer.from(calculatedHash, "hex");
    const bufB = Buffer.from(expectedHashHex, "hex");

    if (bufA.length !== bufB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
