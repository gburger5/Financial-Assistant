/**
 * @module encryption.test
 * @description Unit tests for AES-256-GCM authenticated encryption helpers.
 * Tests cover round-trip correctness, output format, tamper detection,
 * and key derivation behaviour.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt } from '../encryption.js';

// ── helpers ─────────────────────────────────────────────────────────────────

/** Store and restore the real env var around each test. */
const ENV_KEY = 'ENCRYPTION_KEY';
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  // Use a deterministic key for most tests so results are reproducible.
  process.env[ENV_KEY] = 'test-secret-key';
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalEnv;
  }
});

// ── output format ────────────────────────────────────────────────────────────

describe('encrypt', () => {
  it('returns a non-empty string', () => {
    const result = encrypt('hello');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a valid base64 string', () => {
    const result = encrypt('hello world');
    // Standard base64: only A-Z, a-z, 0-9, +, /, =
    expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('encoded blob is at least 28 bytes (12 IV + 0 ciphertext min + 16 tag)', () => {
    // Even an empty plaintext produces IV (12) + tag (16) = 28 bytes → ≥ 40 base64 chars
    const result = encrypt('');
    const raw = Buffer.from(result, 'base64');
    expect(raw.length).toBeGreaterThanOrEqual(28);
  });

  it('produces different ciphertexts on successive calls (random IV)', () => {
    const a = encrypt('same plaintext');
    const b = encrypt('same plaintext');
    expect(a).not.toBe(b);
  });
});

// ── round-trip correctness ───────────────────────────────────────────────────

describe('decrypt', () => {
  it('recovers the original plaintext', () => {
    const plaintext = 'super secret value';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('handles an empty string round-trip', () => {
    expect(decrypt(encrypt(''))).toBe('');
  });

  it('handles unicode plaintext', () => {
    const plaintext = '🔐 café résumé naïve';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('handles a long plaintext round-trip', () => {
    const plaintext = 'a'.repeat(10_000);
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });
});

// ── tamper detection ─────────────────────────────────────────────────────────

describe('tamper detection', () => {
  it('throws when the ciphertext byte is flipped', () => {
    const token = encrypt('sensitive');
    const raw = Buffer.from(token, 'base64');

    // Flip a byte in the ciphertext region (after the 12-byte IV, before the
    // last 16-byte tag).
    const flipped = Buffer.from(raw);
    flipped[12] ^= 0xff; // flip the first ciphertext byte

    expect(() => decrypt(flipped.toString('base64'))).toThrow();
  });

  it('throws when the auth tag is modified', () => {
    const token = encrypt('sensitive');
    const raw = Buffer.from(token, 'base64');

    // Corrupt the last byte of the tag.
    const corrupted = Buffer.from(raw);
    corrupted[corrupted.length - 1] ^= 0x01;

    expect(() => decrypt(corrupted.toString('base64'))).toThrow();
  });

  it('throws when the IV is modified', () => {
    const token = encrypt('sensitive');
    const raw = Buffer.from(token, 'base64');

    // Corrupt the first byte of the IV.
    const corrupted = Buffer.from(raw);
    corrupted[0] ^= 0x01;

    expect(() => decrypt(corrupted.toString('base64'))).toThrow();
  });
});

// ── key derivation ───────────────────────────────────────────────────────────

describe('key derivation', () => {
  it('works with any string as ENCRYPTION_KEY (short string)', () => {
    process.env[ENV_KEY] = 'x';
    const pt = 'hello';
    expect(decrypt(encrypt(pt))).toBe(pt);
  });

  it('works with any string as ENCRYPTION_KEY (very long string)', () => {
    process.env[ENV_KEY] = 'k'.repeat(1000);
    const pt = 'hello';
    expect(decrypt(encrypt(pt))).toBe(pt);
  });

  it('tokens encrypted with one key cannot be decrypted with another', () => {
    process.env[ENV_KEY] = 'key-one';
    const token = encrypt('secret');

    process.env[ENV_KEY] = 'key-two';
    expect(() => decrypt(token)).toThrow();
  });

  it('uses ENCRYPTION_KEY env var; missing var still produces a consistent key', () => {
    // Should not throw even when no key is set (falls back to zero-bytes in
    // non-production per MEMORY.md).
    delete process.env[ENV_KEY];
    const pt = 'test';
    expect(decrypt(encrypt(pt))).toBe(pt);
  });
});
