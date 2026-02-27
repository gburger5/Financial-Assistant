import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

const KEY_HEX = process.env.ENCRYPTION_KEY;
if (!KEY_HEX && process.env.NODE_ENV === "production") {
  throw new Error("ENCRYPTION_KEY must be set in production environment");
}

// 32-byte (256-bit) key; falls back to all-zeros only in non-production
const KEY = Buffer.from(KEY_HEX ?? "0".repeat(64), "hex");

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Returns a colon-delimited hex string: `iv:authTag:ciphertext`
 */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a token produced by `encryptToken`.
 * Throws if the auth tag is invalid (tampered ciphertext).
 */
export function decryptToken(encrypted: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
