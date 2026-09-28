// The dashboard's lint rules (ESLint 9, flat config). Run: pnpm lint.
// Every rule is an error except react/jsx-no-literals: the dashboard has no
// message files yet, so literal text is a warning whose count may only go
// down (scripts/lint.mjs, baselines.json).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist/**', 'scripts/**', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-nested-ternary': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // Off: it trusts the types over the runtime, and here the runtime is
      // less tidy. Go sends an empty list as null, navigator.clipboard is
      // missing outside a secure context, and an index past the end is
      // undefined (tsconfig has no noUncheckedIndexedAccess). Following it
      // would delete guards that matter.
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // Off: every autoFocus here moves focus into a dialog or popover that
      // just opened, or onto the only field of a one-field screen (sign-in),
      // which is what the WAI-ARIA dialog pattern asks for.
      'jsx-a11y/no-autofocus': 'off',
      // Picker and Switch render a <button>: a label around one labels a control.
      'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['Picker', 'Switch'], depth: 3 }],
      // An arrow that returns a setter's void is the usual React handler, and
      // `if (x) return close()` in a function that returns nothing is plain.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true, ignoreVoidReturningFunctions: true }],
      // Numbers read fine in a template; objects and undefined do not.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // React ignores what a handler returns, so an async onClick is fine;
      // a promise passed where a boolean is tested is still caught.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      // Words people read belong in message files; symbols and punctuation
      // may stay in the markup.
      'react/jsx-no-literals': ['warn', {
        noStrings: false,
        ignoreProps: true,
        allowedStrings: [
          '·', '•', '—', '–', '-', '→', '←', '↑', '↓', '↗', '↘', '×', '✓', '✗',
          '…', '/', '|', ':', ',', '.', '(', ')', '%', '+', '−', '=', '&', '#',
          '*', '?', '!', '@', '$', '€', '£', '<', '>', '≤', '≥', "'", '"',
        ],
      }],
    },
  },
  {
    // The AI bots card is read on phones: a title= never shows there, so its
    // hints are the Info tooltip or a tap that shows the whole text.
    files: ['src/features/crawlers/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', { selector: "JSXAttribute[name.name='title']", message: 'title= never shows on a phone: use <Info> or tap to show.' }],
    },
  },
)
