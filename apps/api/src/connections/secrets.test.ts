import { describe, expect, it } from 'vitest';
import { generateSecret, hashSecret, TOKEN_PREFIX } from './secrets.js';

describe('secrets', () => {
  it('generates prefixed, unique, url-safe secrets with 256 bits of randomness', () => {
    const a = generateSecret(TOKEN_PREFIX);
    const b = generateSecret(TOKEN_PREFIX);
    expect(a).toMatch(/^ahq_ct_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('hashes deterministically without containing the secret', () => {
    const secret = generateSecret(TOKEN_PREFIX);
    expect(hashSecret(secret)).toBe(hashSecret(secret));
    expect(hashSecret(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret(secret)).not.toContain(secret);
  });
});
