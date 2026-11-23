import { createHash, randomBytes } from 'node:crypto';

/** Prefixes make leaked secrets recognizable by secret scanners and humans. */
export const TOKEN_PREFIX = 'ahq_ct';
export const REGISTRATION_CODE_PREFIX = 'ahq_rc';

/** 256 bits of randomness, base64url encoded. */
export function generateSecret(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

/**
 * SHA-256 hex digest. A plain hash is sufficient because secrets are 256-bit random values,
 * not user-chosen passwords, so brute force is infeasible without a slow KDF.
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
