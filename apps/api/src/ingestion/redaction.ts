/**
 * Second-stage secret masking at ingestion (data-governance N2). The first stage is the
 * source or bridge; this one catches what slipped through before anything is stored.
 *
 * Pattern matching is incomplete by nature (RSK-002): the primary defence is that full
 * content (D2) is not captured at all. These patterns cover common credential shapes only.
 */
interface SecretPattern {
  kind: string;
  pattern: RegExp;
  /** Keeps a non-secret prefix (e.g. `password=`) so the text stays readable. */
  keepGroup?: number;
}

/**
 * A value that looks like a credential rather than a word: it has a digit or symbol, or is
 * long. Keeps `token: expired` or `Basic configuration` readable (false positives hide the
 * very text the dashboard exists to show) while `hunter22` or a long passphrase is masked.
 * `marks` must be a subset of `chars`, so a symbol right after the value does not count.
 * Already-masked text is skipped.
 */
const secretValue = (chars: string, marks: string, min: number) =>
  `(?!\\[REDACTED)(?:(?=${chars}*${marks})${chars}{${min},}|${chars}{16,})`;

/**
 * Credential-like key names, also as the last part of longer names such as `GITHUB_TOKEN`
 * or `"api_key"`: `_` and `-` are not letters or digits, so the lookbehind lets a keyword
 * start right after them. Matching starts only at the keyword itself, which keeps the scan
 * linear in the input length (a free-form prefix group made it quadratic: PR #5 review).
 */
const CREDENTIAL_KEY =
  '(?<![A-Za-z0-9])(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)';

const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    kind: 'private-key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  },
  // Agent HQ's own connection tokens and registration codes.
  { kind: 'agent-hq-secret', pattern: /\bahq_(?:ct|rc)_[A-Za-z0-9_-]{8,}/g },
  { kind: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{8,}/g },
  { kind: 'api-key', pattern: /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}/g },
  { kind: 'stripe-key', pattern: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{10,}/g },
  {
    kind: 'github-token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
  },
  { kind: 'gitlab-token', pattern: /\bglpat-[A-Za-z0-9_-]{20,}/g },
  { kind: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}/g },
  { kind: 'slack-token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { kind: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  {
    kind: 'bearer',
    pattern: new RegExp(
      `(\\bBearer\\s+)${secretValue('[A-Za-z0-9_.~+/=-]', '[0-9_.~+/=-]', 8)}`,
      'gi',
    ),
    keepGroup: 1,
  },
  {
    kind: 'basic-auth',
    pattern: new RegExp(`(\\bBasic\\s+)${secretValue('[A-Za-z0-9+/=]', '[0-9+/=]', 8)}`, 'gi'),
    keepGroup: 1,
  },
  {
    kind: 'credential-assignment',
    pattern: new RegExp(
      `(${CREDENTIAL_KEY}["']?\\s*[:=]\\s*["']?)${secretValue('[^\\s"\',;&]', '[0-9_\\-+/=.@!#$%^*~]', 4)}`,
      'gi',
    ),
    keepGroup: 1,
  },
  {
    kind: 'url-credentials',
    // The lookbehind makes the scheme start only once per word (linear scan, not quadratic).
    pattern: /((?<![a-z0-9+.-])[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s/@]+(?=@)/gi,
    keepGroup: 1,
  },
];

export interface RedactionResult<T> {
  value: T;
  /** Dotted paths of the strings that were changed, e.g. `payload.inputSummary`. */
  redactedFields: string[];
}

export function redactText(text: string): string {
  let result = text;
  for (const { kind, pattern, keepGroup } of SECRET_PATTERNS) {
    result = result.replace(pattern, (whole: string, ...groups: unknown[]) => {
      const group = keepGroup === undefined ? undefined : groups[keepGroup - 1];
      const kept = typeof group === 'string' ? group : '';
      return whole === '' ? whole : `${kept}[REDACTED:${kind}]`;
    });
  }
  return result;
}

/** Masks secrets in every string inside `value`, keeping its shape. */
export function redactSecrets<T>(value: T, path: string): RedactionResult<T> {
  const redactedFields: string[] = [];
  const walk = (current: unknown, at: string): unknown => {
    if (typeof current === 'string') {
      const masked = redactText(current);
      if (masked !== current) redactedFields.push(at);
      return masked;
    }
    if (Array.isArray(current)) return current.map((item, i) => walk(item, `${at}.${i}`));
    if (typeof current === 'object' && current !== null) {
      return Object.fromEntries(
        Object.entries(current).map(([key, item]) => [key, walk(item, `${at}.${key}`)]),
      );
    }
    return current;
  };
  // Safe: `walk` only replaces strings with strings, so the shape of T is preserved.
  return { value: walk(value, path) as T, redactedFields };
}
