import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Messages and nicknames are rendered only as React text (design D4).
      'react/no-danger': 'error',
    },
  },
  {
    // Playwright fixtures receive a `use` callback that is not a React hook.
    files: ['e2e/**'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated test and runtime output:
    'test-results/**',
    'playwright-report/**',
    'data/**',
    '.agent-loop/**',
  ]),
])

export default eslintConfig
