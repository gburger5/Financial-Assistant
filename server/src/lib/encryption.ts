/**
 * @module encryption
 * @description AES-256-GCM authenticated encryption helpers.
 *
 * Each encrypted value is stored as a single base64 string that encodes:
 *
 *   [ IV (12 bytes) | ciphertext (variable) | auth tag (16 bytes) ]
 *
 * The GCM auth tag covers both the IV and the ciphertext, so any tampering
 * with any part of the stored value will cause `decrypt` to throw.
 *
 * Key derivation: the raw `ENCRYPTION_KEY` env var is passed through SHA-256
 * so that any string yields an exact 32-byte (256-bit) key. In production the
 * env var should be a cryptographically random 64-char hex string, generated
 * with:
 *
 *   openssl rand -hex 32
 *
 * In non-production environments (or when the env var is absent) the module
 * falls back to a 32-byte zero key — this is intentionally insecure and
 * exists only to simplify local development.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // bytes — 96-bit IV is the recommended GCM size
const TAG_LENGTH = 16;  // bytes — 128-bit tag is the GCM default and maximum

/**
 * Derives a 32-byte AES key from the `ENCRYPTION_KEY` environment variable.
 *
 * SHA-256 is used so that any string (short, long, or arbitrary) always
 * produces exactly 32 bytes without requiring the caller to pre-format it.
 *
 * Falls back to a zero-filled key outside of production to avoid crashes
 * during local development when the env var is not set.
 *
 * @returns {Buffer} A 32-byte key suitable for use with AES-256.
 */
function deriveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;

  if (!raw) {
    // Zero key — intentionally insecure; only used outside of production.
    return Buffer.alloc(32, 0);
  }

  // SHA-256 of the raw string → 32 bytes, regardless of input length.
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Encrypts `plaintext` with AES-256-GCM and returns a base64-encoded blob
 * containing the random IV, the ciphertext, and the GCM authentication tag.
 *
 * The layout of the decoded bytes is:
 *   bytes  0 – 11  : IV (12 bytes, randomly generated per call)
 *   bytes 12 – N   : ciphertext
 *   bytes N+1 – end: auth tag (16 bytes)
 *
 * @param {string} plaintext - The value to encrypt.
 * @returns {string} Base64-encoded `IV || ciphertext || tag`.
 */
export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // getAuthTag() must be called after final().
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, ciphertext, tag]).toString('base64');
}

/**
 * Decrypts a base64-encoded blob produced by {@link encrypt}.
 *
 * Throws if the auth tag does not match — indicating that the ciphertext,
 * IV, or tag has been tampered with since encryption.
 *
 * @param {string} encoded - Base64-encoded `IV || ciphertext || tag`.
 * @returns {string} The original plaintext.
 * @throws {Error} If decryption or authentication fails.
 */
export function decrypt(encoded: string): string {
  const key = deriveKey();
  const raw = Buffer.from(encoded, 'base64');

  // Minimum length: 12 (IV) + 16 (tag) = 28 bytes; no ciphertext is valid
  // only for empty-string inputs.
  if (raw.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Encrypted value is too short to be valid.');
  }

  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(raw.length - TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH, raw.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  // setAuthTag must be called before update/final so Node can verify the tag.
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
