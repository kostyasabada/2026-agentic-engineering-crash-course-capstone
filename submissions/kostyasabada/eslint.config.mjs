import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// Layer boundaries (design D4). `no-restricted-imports` matches the import string, and
// imports between these folders are relative (no `paths` alias in tsconfig.json), so
// directory targets are regexes anchored to relative specifiers, file kinds match the
// file-name suffix, and packages are exact names. If a path alias is ever added, its
// forms must be added here too.
const rel = (dir, message) => ({ regex: `^\\.{1,2}/(?:.*/)?${dir}(?:/|$)`, message })
const kind = (suffix, message) => ({ regex: `(?:^|/)[^/]+\\.${suffix}(?:\\.ts)?$`, message })
const pkg = (name, message) => ({ name, message })

const noServer = rel('server', 'Browser and shared code must not import server code (src/server/**, server.ts); share code through src/lib/** (design D4).')
const noApp = rel('app', 'Server and shared code must not import src/app/** or the composition root src/server/app.ts (design D4).')
const noDb = rel('db', 'Services and controllers must not use the database layer src/server/db/** directly; go through a repository (design D4).')
const noController = kind('controller', 'Services and repositories must not import controllers (design D4).')
const noService = kind('service', 'Repositories must not import services (design D4).')
const noRepository = kind('repository', 'Controllers must not import repositories; call the service (design D4).')
const noSocketIo = pkg('socket.io', 'Services and repositories must not use socket.io; it belongs to the transport layer (design D4).')
const noSqlite = pkg('better-sqlite3', 'Services and controllers must not use better-sqlite3; persistence goes through repositories (design D4).')

// Tests are outside the boundaries: controller tests use the real repository and
// database, and app.test.ts imports ./app (design D4, production files only).
const productionOnly = ['**/*.test.ts']

// In flat config, a later object that sets `no-restricted-imports` replaces the options
// of earlier objects for the same file. Narrower server groups therefore come after
// `src/server/**` and repeat its patterns (`serverBase`).
const serverBase = [noApp]
const boundary = (files, patterns, paths = []) => ({
  files,
  ignores: productionOnly,
  rules: { 'no-restricted-imports': ['error', { paths, patterns }] },
})

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
  // Browser code (user decision): src/app/** must not import src/server/**.
  boundary(['src/app/**'], [noServer]),
  // Shared code is imported by both sides and depends on neither.
  boundary(['src/lib/**'], [noServer, noApp]),
  // Server code must not import browser code or the composition root (review finding F4).
  boundary(['src/server/**'], serverBase),
  // Services: business rules only; no transport, driver, controllers, or database layer.
  boundary(['src/server/**/*.service.ts'], [...serverBase, noController, noDb], [noSocketIo, noSqlite]),
  // Repositories: persistence only; no services, controllers, or transport.
  boundary(['src/server/**/*.repository.ts'], [...serverBase, noService, noController], [noSocketIo]),
  // Controllers (user decision): transport only; no driver, repositories, or database layer.
  boundary(['src/server/**/*.controller.ts'], [...serverBase, noRepository, noDb], [noSqlite]),
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
