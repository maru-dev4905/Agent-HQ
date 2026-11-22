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
  ['apps/api/**', ['@agent-hq/web', '@agent-hq/simulator']],
  ['apps/web/**', ['@agent-hq/api', '@agent-hq/database', '@agent-hq/simulator']],
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
);
