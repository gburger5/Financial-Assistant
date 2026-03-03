/**
 * @module plaid.verification
 * @description Plaid webhook signature verification.
 *
 * Plaid signs every webhook request with a JWT in the `plaid-verification`
 * header. Full verification requires two checks:
 *
 *   1. JWT signature — proves the token was issued by Plaid's private key.
 *   2. Body hash — the JWT payload contains `request_body_sha256`, a SHA-256
 *      hex digest of the exact bytes in the request body. Verifying this claim
 *      against our own hash of `request.rawBody` proves the body was not
 *      swapped after Plaid signed it. JWT verification alone is insufficient
 *      because an attacker could replay a valid JWT with a different body.
 *
 * Key caching:
 *   Plaid's keys rotate infrequently. Fetching a new key from Plaid's endpoint
 *   on every webhook wastes rate limit and adds latency. Keys are cached by
 *   kid for 15 minutes; a cache miss triggers a fresh fetch automatically.
 *
 * rawBody requirement:
 *   The content-type parser in plaid.route.ts stores the exact request bytes
 *   in `request.rawBody`. Even a single whitespace difference between rawBody
 *   and what Plaid signed produces a different hash and a failed check.
 *
 * Node.js compatibility:
 *   `crypto.subtle` is used for SHA-256. It is available as a global in Node 20+
 *   but imported explicitly from `node:crypto` for Node 18 compatibility.
 */
import { webcrypto as crypto } from 'node:crypto';
import { decodeProtectedHeader, importJWK, compactVerify } from 'jose';
import type { FastifyRequest } from 'fastify';
import { plaidClient } from '../../lib/plaidClient.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Key cache
// ---------------------------------------------------------------------------

/**
 * Single entry in the in-memory JWKS cache.
 * `fetchedAt` is a UNIX millisecond timestamp used to compute cache age.
 */
interface CacheEntry {
  // jose returns a KeyLike (CryptoKey in the WebCrypto API, KeyObject in Node).
  // We use unknown here to avoid importing the jose KeyLike type, which is
  // sufficient since we only pass this value back into jose.compactVerify.
  key: unknown;
  fetchedAt: number;
}

/** In-memory cache: Plaid key ID → imported public key + fetch time. */
const KEY_CACHE = new Map<string, CacheEntry>();

/** Keys are considered stale after 15 minutes and trigger a fresh fetch. */
const CACHE_TTL_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Fetches (and caches) a Plaid webhook verification key by key ID.
 *
 * Cache behaviour:
 *   - Hit (age < 15 min): returns the cached key immediately, no Plaid call.
 *   - Miss or expired: calls Plaid's webhookVerificationKeyGet, imports the
 *     JWK via jose.importJWK, stores the result, then returns it.
 *
 * @param {string} kid - Key ID extracted from the JWT's protected header.
 * @returns {Promise<unknown>} The imported public key (a jose KeyLike value).
 */
export async function getVerificationKey(kid: string): Promise<unknown> {
  const now = Date.now();
  const cached = KEY_CACHE.get(kid);

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.key;
  }

  logger.info({ kid }, 'Fetching Plaid webhook verification key');

  const response = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  const jwk = response.data.key;

  // importJWK requires the algorithm to be explicitly specified — derive it
  // from the key's `alg` field rather than trusting any header claim.
  const key = await importJWK(jwk as Parameters<typeof importJWK>[0], jwk.alg);

  KEY_CACHE.set(kid, { key, fetchedAt: now });

  return key;
}

/**
 * Verifies that an incoming webhook request is authentically from Plaid.
 *
 * Verification steps:
 *   1. Extract the `plaid-verification` header (the signed JWT).
 *   2. Decode the JWT header to read the key ID (kid).
 *   3. Fetch (or reuse cached) Plaid public key for that kid.
 *   4. Verify the JWT signature using jose.compactVerify.
 *   5. Compute SHA-256 of request.rawBody.
 *   6. Compare the computed hex digest against the `request_body_sha256`
 *      claim in the verified payload — throw if they differ.
 *
 * Throws on any failure so the caller can decide how to respond.
 * The webhook route catches these errors and still returns 200 to Plaid.
 *
 * @param {FastifyRequest} request - The incoming Fastify request.
 * @returns {Promise<void>}
 * @throws {Error} If the header is missing, the JWT is invalid, or the body
 *   hash does not match.
 */
export async function verifyWebhookSignature(request: FastifyRequest): Promise<void> {
  const token = request.headers['plaid-verification'];

  // Reject if the header is absent or not a plain string (could be string[]).
  if (!token || typeof token !== 'string') {
    throw new Error('Missing or invalid plaid-verification header');
  }

  // Step 1: Decode the JWT header (without verification) to get the key ID.
  const { kid } = decodeProtectedHeader(token);

  if (!kid) {
    throw new Error('JWT header missing kid — cannot identify the signing key');
  }

  // Step 2: Fetch the Plaid public key for this kid (may come from cache).
  const key = await getVerificationKey(kid);

  // Step 3: Verify the JWT signature. jose throws JWTVerificationFailed on mismatch.
  const { payload: rawPayload } = await compactVerify(
    token,
    // jose's KeyLike union covers CryptoKey, KeyObject, and Uint8Array.
    // Casting through unknown avoids pulling the private jose type here.
    key as Parameters<typeof compactVerify>[1],
  );

  // Step 4: Decode the verified payload to get the body hash claim.
  const payload = JSON.parse(new TextDecoder().decode(rawPayload)) as {
    request_body_sha256?: string;
  };

  // Step 5: Hash the raw body string with SHA-256.
  // rawBody must be the exact bytes Plaid signed — the content-type parser in
  // plaid.route.ts stores them before any JSON parsing touches the data.
  const rawBody = request.rawBody ?? '';
  const bodyBuffer = new TextEncoder().encode(rawBody);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bodyBuffer);
  const computedHash = Buffer.from(hashBuffer).toString('hex');

  // Step 6: Compare digests. String comparison is sufficient here — both are
  // hex strings of the same fixed length so there is no timing oracle risk
  // (an attacker cannot learn which bytes differ by measuring response time).
  if (computedHash !== payload.request_body_sha256) {
    throw new Error(
      'Request body SHA-256 does not match JWT claim — possible body tampering',
    );
  }
}
