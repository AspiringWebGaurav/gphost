import { argon2id } from "hash-wasm";
import crypto from "node:crypto";

export const PIN_PEPPER =
  process.env.PIN_PEPPER ||
  process.env.PASSWORD_PEPPER ||
  (process.env.NODE_ENV !== "production" ? "gphost_dev_pin_pepper" : "");

/**
 * Validates that an onboarding PIN is strictly 4 decimal digits.
 */
export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

/**
 * Generates a cryptographically random 16-byte hex salt for a new PIN.
 */
export function generatePinSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Computes an Argon2id hash for an onboarding PIN combined with server pepper and random salt.
 */
export async function hashPin(pin: string, saltHex: string, pepper = PIN_PEPPER): Promise<string> {
  if (!isValidPinFormat(pin)) {
    throw new Error("Invalid PIN format: must be strictly 4 decimal digits");
  }

  const salt = Buffer.from(saltHex, "hex");

  return await argon2id({
    password: pin + pepper,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 64 * 1024, // 64 MB
    hashLength: 32,
    outputType: "hex",
  });
}

/**
 * Verifies an onboarding PIN against an expected hash using constant-time comparison.
 */
export async function verifyPin(
  pin: string,
  saltHex: string,
  expectedHashHex: string,
  pepper = PIN_PEPPER
): Promise<boolean> {
  if (!isValidPinFormat(pin)) {
    return false;
  }

  try {
    const calculatedHash = await hashPin(pin, saltHex, pepper);
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
