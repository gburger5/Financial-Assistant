/**
 * @module plaid.verification.test
 * @description Unit tests for Plaid webhook signature verification.
 * The Plaid client (for key fetching) and the jose JWT library are fully mocked.
 * SHA-256 body hashing uses Node's real crypto.subtle so that the hash contract
 * is verified without introducing a separate crypto mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockWebhookVerificationKeyGet, mockDecodeProtectedHeader, mockImportJWK, mockCompactVerify } =
  vi.hoisted(() => ({
    mockWebhookVerificationKeyGet: vi.fn(),
    mockDecodeProtectedHeader: vi.fn(),
    mockImportJWK: vi.fn(),
    mockCompactVerify: vi.fn(),
  }));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../lib/plaidClient.js', () => ({
  plaidClient: {
    webhookVerificationKeyGet: mockWebhookVerificationKeyGet,
  },
}));

vi.mock('jose', () => ({
  decodeProtectedHeader: mockDecodeProtectedHeader,
  importJWK: mockImportJWK,
  compactVerify: mockCompactVerify,
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { verifyWebhookSignature } from '../plaid.verification.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes the SHA-256 hex digest of a string, matching the hash that
 * verifyWebhookSignature computes internally before comparing to the
 * request_body_sha256 JWT claim.
 *
 * @param {string} text - The raw body string to hash.
 * @returns {Promise<string>} Hex-encoded SHA-256 digest.
 */
async function sha256Hex(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await webcrypto.subtle.digest('SHA-256', msgBuffer);
  return Buffer.from(hashBuffer).toString('hex');
}

/**
 * Builds a minimal fake FastifyRequest with the fields used by verifyWebhookSignature.
 */
function makeRequest(overrides: {
  verificationHeader?: string;
  rawBody?: string;
}): FastifyRequest {
  return {
    headers: {
      'plaid-verification': overrides.verificationHeader ?? 'test.jwt.token',
    },
    rawBody: overrides.rawBody ?? '{}',
  } as unknown as FastifyRequest;
}

/** Plaid JWKS key response shape. */
const fakePlaidKey = {
  data: {
    key: {
      alg: 'ES256',
      crv: 'P-256',
      kid: 'test-kid-1',
      kty: 'EC',
      use: 'sig',
      x: 'base64x',
      y: 'base64y',
      created_at: 1700000000,
      expired_at: null,
    },
  },
};

/** Fake CryptoKey object returned by jose.importJWK. */
const fakePublicKey = { type: 'public', algorithm: { name: 'ECDSA' } };

beforeEach(() => {
  vi.clearAllMocks();
  mockDecodeProtectedHeader.mockReturnValue({ kid: 'test-kid-1' });
  mockWebhookVerificationKeyGet.mockResolvedValue(fakePlaidKey);
  mockImportJWK.mockResolvedValue(fakePublicKey);
});

// ---------------------------------------------------------------------------
// verifyWebhookSignature — header validation
// ---------------------------------------------------------------------------

describe('verifyWebhookSignature — header validation', () => {
  it('throws when the plaid-verification header is missing', async () => {
    const request = {
      headers: {},
      rawBody: '{}',
    } as unknown as FastifyRequest;

    await expect(verifyWebhookSignature(request)).rejects.toThrow();
  });

  it('throws when the plaid-verification header is an empty string', async () => {
    const request = makeRequest({ verificationHeader: '' });

    await expect(verifyWebhookSignature(request)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// verifyWebhookSignature — key fetching
// ---------------------------------------------------------------------------

describe('verifyWebhookSignature — key fetching', () => {
  it('decodes the JWT header to extract kid', async () => {
    const rawBody = '{"test":"payload"}';
    const bodyHash = await sha256Hex(rawBody);

    mockCompactVerify.mockResolvedValue({
      payload: new TextEncoder().encode(JSON.stringify({ request_body_sha256: bodyHash })),
      protectedHeader: { kid: 'test-kid-1' },
    });

    const request = makeRequest({ rawBody });
    await verifyWebhookSignature(request);

    expect(mockDecodeProtectedHeader).toHaveBeenCalledWith('test.jwt.token');
  });

  it('calls webhookVerificationKeyGet with the kid from the JWT header', async () => {
    // Use a unique kid so the module-level KEY_CACHE from earlier tests does not short-circuit
    // this test's assertion. The cache is module state that persists within a test file.
    const kid = 'fetch-kid-A';
    mockDecodeProtectedHeader.mockReturnValue({ kid });
    const rawBody = '{"test":"payload"}';
    const bodyHash = await sha256Hex(rawBody);

    mockCompactVerify.mockResolvedValue({
      payload: new TextEncoder().encode(JSON.stringify({ request_body_sha256: bodyHash })),
      protectedHeader: { kid },
    });

    const request = makeRequest({ rawBody });
    await verifyWebhookSignature(request);

    expect(mockWebhookVerificationKeyGet).toHaveBeenCalledWith({ key_id: kid });
  });

  it('imports the JWK returned by Plaid before verifying', async () => {
    // Use a unique kid to avoid KEY_CACHE hits from other tests in this file.
    const kid = 'fetch-kid-B';
    mockDecodeProtectedHeader.mockReturnValue({ kid });
    const rawBody = '{"test":"payload"}';
    const bodyHash = await sha256Hex(rawBody);

    mockCompactVerify.mockResolvedValue({
      payload: new TextEncoder().encode(JSON.stringify({ request_body_sha256: bodyHash })),
      protectedHeader: { kid },
    });

    const request = makeRequest({ rawBody });
    await verifyWebhookSignature(request);

    expect(mockImportJWK).toHaveBeenCalledWith(fakePlaidKey.data.key, fakePlaidKey.data.key.alg);
  });
});

// ---------------------------------------------------------------------------
// verifyWebhookSignature — JWT verification
// ---------------------------------------------------------------------------

describe('verifyWebhookSignature — JWT verification', () => {
  it('calls jose.compactVerify with the JWT and the imported public key', async () => {
    const rawBody = '{"test":"payload"}';
    const bodyHash = await sha256Hex(rawBody);

    mockCompactVerify.mockResolvedValue({
      payload: new TextEncoder().encode(JSON.stringify({ request_body_sha256: bodyHash })),
      protectedHeader: { kid: 'test-kid-1' },
    });

    const request = makeRequest({ rawBody });
    await verifyWebhookSignature(request);

    expect(mockCompactVerify).toHaveBeenCalledWith('test.jwt.token', fakePublicKey);
  });

  it('throws when jose.compactVerify rejects (bad signature)', async () => {
    mockCompactVerify.mockRejectedValue(new Error('JWTVerificationFailed'));

    const request = makeRequest({ rawBody: '{}' });

    await expect(verifyWebhookSignature(request)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// verifyWebhookSignature — body hash check
// ---------------------------------------------------------------------------

describe('verifyWebhookSignature — body hash check', () => {
  it('resolves when request_body_sha256 matches SHA-256 of rawBody', async () => {
    const rawBody = '{"webhook_type":"TRANSACTIONS","item_id":"item-1"}';
    const bodyHash = await sha256Hex(rawBody);

    mockCompactVerify.mockResolvedValue({
      payload: new TextEncoder().encode(JSON.stringify({ request_body_sha256: bodyHash })),
      protectedHeader: { kid: 'test-kid-1' },
    });

    const request = makeRequest({ rawBody });

    await expect(verifyWebhookSignature(request)).resolves.not.toThrow();
  });

  it('throws when request_body_sha256 does not match SHA-256 of rawBody', async () => {
    const rawBody = '{"webhook_type":"TRANSACTIONS","item_id":"item-1"}';
    // Provide a hash that does NOT match the actual rawBody
    const wrongHash = 'aaaa0000bbbb1111cccc2222dddd3333eeee4444ffff5555aaaa0000bbbb1111';

    mockCompactVerify.mockResolvedValue({
      payload: new TextEncoder().encode(JSON.stringify({ request_body_sha256: wrongHash })),
      protectedHeader: { kid: 'test-kid-1' },
    });

    const request = makeRequest({ rawBody });

    await expect(verifyWebhookSignature(request)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Key caching
// ---------------------------------------------------------------------------

describe('verifyWebhookSignature — key caching', () => {
  it('fetches the key from Plaid on the first call for a given kid', async () => {
    const rawBody = '{"test":"body"}';
    const bodyHash = await sha256Hex(rawBody);

    mockCompactVerify.mockResolvedValue({
      payload: new TextEncoder().encode(JSON.stringify({ request_body_sha256: bodyHash })),
      protectedHeader: { kid: 'cache-kid-1' },
    });
    mockDecodeProtectedHeader.mockReturnValue({ kid: 'cache-kid-1' });

    const request = makeRequest({ rawBody });
    await verifyWebhookSignature(request);

    expect(mockWebhookVerificationKeyGet).toHaveBeenCalledTimes(1);
  });

  it('reuses the cached key on a second call with the same kid', async () => {
    const rawBody = '{"test":"body"}';
    const bodyHash = await sha256Hex(rawBody);

    mockCompactVerify.mockResolvedValue({
      payload: new TextEncoder().encode(JSON.stringify({ request_body_sha256: bodyHash })),
      protectedHeader: { kid: 'cache-kid-2' },
    });
    mockDecodeProtectedHeader.mockReturnValue({ kid: 'cache-kid-2' });

    const request = makeRequest({ rawBody });

    // First call — should fetch from Plaid
    await verifyWebhookSignature(request);
    // Second call — should use cached key
    await verifyWebhookSignature(request);

    // Plaid should only be called once; the second call uses the cache.
    expect(mockWebhookVerificationKeyGet).toHaveBeenCalledTimes(1);
  });
});
