import { describe, expect, it } from 'vitest';
import { redactSecrets, redactText } from './redaction.js';

// Fake credentials assembled at runtime so secret scanners do not flag this file.
const fake = (...parts: string[]) => parts.join('');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SAMPLES: Record<string, string> = {
  'agent-hq-secret': fake('ahq_ct_', 'AbCdEf0123456789xyz'),
  'anthropic-key': fake('sk-ant-', 'api03-', 'A'.repeat(30)),
  'api-key': fake('sk-proj-', 'B'.repeat(30)),
  'github-token': fake('ghp_', 'C'.repeat(36)),
  'aws-access-key': fake('AKIA', 'ABCDEFGHIJKLMNOP'),
  'google-api-key': fake('AIza', 'D'.repeat(35)),
  'slack-token': fake('xoxb-', '1234567890-abcdef'),
  jwt: fake('eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxIn0abc', '.', 'sig_abcdefgh123'),
  'private-key': fake(
    '-----BEGIN RSA ',
    'PRIVATE KEY-----\nMIIE\n-----END RSA ',
    'PRIVATE KEY-----',
  ),
};

describe('redactText', () => {
  for (const [kind, secret] of Object.entries(SAMPLES)) {
    it(`masks ${kind}`, () => {
      const masked = redactText(`before ${secret} after`);
      expect(masked).not.toContain(secret);
      expect(masked).toContain('before ');
      expect(masked).toContain(' after');
    });
  }

  it('keeps the non-secret prefix of bearer headers, assignments and URL credentials', () => {
    expect(redactText(fake('Authorization: Bearer ', 'abc.def-ghi_123456'))).toBe(
      'Authorization: Bearer [REDACTED:bearer]',
    );
    expect(redactText(fake('Authorization: Basic ', 'dXNlcjpwYXNzd29yZA=='))).toBe(
      'Authorization: Basic [REDACTED:basic-auth]',
    );
    expect(redactText(fake('curl -H "Bearer ', 'abcdefgh12345678"'))).toBe(
      'curl -H "Bearer [REDACTED:bearer]"',
    );
    expect(redactText(fake('password=', 'hunter22 and more'))).toBe(
      'password=[REDACTED:credential-assignment] and more',
    );
    expect(redactText(fake('postgres://user:', 's3cretpw', '@db:5432/x'))).toBe(
      'postgres://user:[REDACTED:url-credentials]@db:5432/x',
    );
  });

  it('masks credential assignments in env, JSON and Python forms (review #2)', () => {
    const cases = [
      [fake('export GITHUB_TOKEN=', 'abcd1234efgh'), 'export GITHUB_TOKEN='],
      [fake('DATABASE_PASSWORD=', 'hunter22'), 'DATABASE_PASSWORD='],
      [fake('AWS_SECRET_ACCESS_KEY=', 'wJalrXUtnFEMI/K7MDENG'), 'AWS_SECRET_ACCESS_KEY='],
      [fake('OPENAI_API_KEY=', 'abcd1234'), 'OPENAI_API_KEY='],
      [fake('{"password":"', 'hunter22', '"}'), '{"password":"'],
      [fake("{'api_key': '", 'abcd1234', "'}"), "{'api_key': '"],
      [fake('password=', 'correcthorsebatterystaple'), 'password='],
    ] as const;
    for (const [text, prefix] of cases) {
      expect(redactText(text)).toMatch(
        new RegExp(`^${escape(prefix)}\\[REDACTED:credential-assignment\\]`),
      );
    }
    expect(redactText(fake('sk_live_', 'a1b2c3d4e5f6g7'))).toBe('[REDACTED:stripe-key]');
    expect(redactText(fake('glpat-', 'x'.repeat(20)))).toBe('[REDACTED:gitlab-token]');
    // A key already masked by a specific pattern is not masked twice.
    expect(redactText(fake('GITHUB_TOKEN=', SAMPLES['github-token']!))).toBe(
      'GITHUB_TOKEN=[REDACTED:github-token]',
    );
  });

  it('does not mask ordinary words after credential-like keywords (review #4)', () => {
    for (const text of [
      'Basic configuration completed',
      'bearer extraordinary news',
      'pwd: /Users/me/project',
      'token: expired',
      'secret: unknown',
      'basic understanding_of things',
      'Basic settings!',
      'Bearer abcdefgh@',
    ]) {
      expect(redactText(text)).toBe(text);
    }
  });

  it('documents known misses accepted under RSK-002 (no separator, short plain words)', () => {
    for (const text of [
      fake('mytoken=', 'abcd1234efgh'),
      fake('password: ', 'correcthorse'),
      fake('set PASSWORD ', 'hunter22'),
    ]) {
      expect(redactText(text)).toBe(text);
    }
  });

  it('leaves ordinary text untouched', () => {
    for (const text of ['Read src/index.ts', 'ran pnpm test (132 passed)', 'token count: 42', '']) {
      expect(redactText(text)).toBe(text);
    }
  });
});

describe('redactSecrets', () => {
  it('masks nested strings and reports their paths only', () => {
    const secret = SAMPLES['github-token']!;
    const result = redactSecrets(
      { inputSummary: `push with ${secret}`, durationMs: 5, nested: { list: ['ok', secret] } },
      'payload',
    );
    expect(JSON.stringify(result.value)).not.toContain(secret);
    expect(result.value.durationMs).toBe(5);
    expect(result.redactedFields).toEqual(['payload.inputSummary', 'payload.nested.list.1']);
  });
});

describe('redactText performance', () => {
  it('stays linear on long adversarial input (ReDoS, PR #5 review)', () => {
    // 65,000 characters is about the largest string one 64 KiB event can carry.
    const shapes = ['a_', 'a-', 'a', 'token', 'x:/', 'Bearer ', 'aa://b'];
    for (const shape of shapes) {
      const input = shape.repeat(Math.ceil(65_000 / shape.length));
      const started = performance.now();
      redactText(input);
      // Quadratic behaviour took seconds here; linear takes a few milliseconds.
      expect(performance.now() - started).toBeLessThan(250);
    }
  });
});
