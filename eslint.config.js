// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Dependency direction rules (coding-standards §4).
 * Each entry lists the workspace packages a directory must NOT import.
 * @type {Array<[string, string[]]>}
 */
const forbiddenImports = [
  ['packages/domain/**', ['@agent-hq/*']],
  [
    'packages/events/**',
    [
      '@agent-hq/contracts',
      '@agent-hq/database',
      '@agent-hq/simulator',
      '@agent-hq/api',
      '@agent-hq/web',
    ],
  ],
  [
    'packages/contracts/**',
    ['@agent-hq/database', '@agent-hq/simulator', '@agent-hq/api', '@agent-hq/web'],
  ],
  [
    'packages/database/**',
    ['@agent-hq/contracts', '@agent-hq/simulator', '@agent-hq/api', '@agent-hq/web'],
  ],
  ['packages/simulator/**', ['@agent-hq/database', '@agent-hq/api', '@agent-hq/web']],
  [
    'packages/adapter-claude-code/**',
    [
      '@agent-hq/domain',
      '@agent-hq/contracts',
      '@agent-hq/database',
      '@agent-hq/simulator',
      '@agent-hq/api',
      '@agent-hq/web',
    ],
  ],
  // The API serves every source alike: adapters run in the Bridge, never in the API.
  ['apps/api/**', ['@agent-hq/web', '@agent-hq/simulator', '@agent-hq/adapter-claude-code']],
  [
    'apps/web/**',
    ['@agent-hq/api', '@agent-hq/database', '@agent-hq/simulator', '@agent-hq/adapter-claude-code'],
  ],
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      'packages/database/src/generated/**',
      'docs/research/source/**',
      'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Explicit projects so tests and tool configs are type-checked too.
        project: [
          './packages/*/tsconfig.json',
          './apps/api/tsconfig.json',
          './apps/web/tsconfig.json',
          './tsconfig.test.json',
          './tsconfig.tools.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // `const { serverOwned: _x, ...rest } = obj` is the idiom for dropping fields.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  ...forbiddenImports.map(([files, patterns]) => {
    /** @type {import('eslint').Linter.RuleEntry} */
    const rule = [
      'error',
      {
        patterns: [
          {
            group: patterns,
            message: 'Violates the dependency direction (docs/engineering/coding-standards.md §4).',
          },
        ],
      },
    ];
    return { files: [files], rules: { 'no-restricted-imports': rule } };
  }),
  // Tests may use the simulator and the adapter as fixture sources (testing-strategy §1);
  // production code may not. Derived from the apps/api entry so other restrictions keep applying to tests.
  {
    files: ['apps/api/**/*.test.ts', 'apps/api/test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: (
                forbiddenImports.find(([files]) => files === 'apps/api/**')?.[1] ?? []
              ).filter(
                (name) =>
                  name !== '@agent-hq/simulator' && name !== '@agent-hq/adapter-claude-code',
              ),
              message:
                'Violates the dependency direction (docs/engineering/coding-standards.md §4).',
            },
          ],
        },
      ],
    },
  },
);
