// ESLint flat config — applies to the CLI's own source.
// Templates under templates/ ship their own eslint.config.js.tmpl
// for generated spaces, so they're excluded here.
//
// Philosophy: lean. Strict tsc + tests already catch the
// high-value class. ESLint adds the few things tsc doesn't —
// `no-unused-vars`, `no-empty`, `no-constant-condition`, and
// stylistic guardrails that prevent footguns (e.g. `prefer-const`,
// `eqeqeq`). Keep the ruleset short; bend toward signal over noise.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'templates/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // tsc --noUnusedLocals/Parameters already covers this strictly,
      // but turn on the TS-aware variant for editor surface.
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // Allow `any` — the CLI deals with a lot of free-form JSON
      // (manifests, npm responses, model definitions) where `any`
      // is honest about the shape. Tighten case-by-case in the
      // hot paths, not globally.
      '@typescript-eslint/no-explicit-any': 'off',

      // Console output IS the CLI's UI.
      'no-console': 'off',

      // Real footguns.
      'eqeqeq': ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-implicit-coercion': 'warn',
    },
  },
]
