// trckable browser suite: real trckabled + a real site, in Chromium, Firefox
// and WebKit (Safari's engine). Counts are asserted exactly via /api/v1.
import { defineConfig, devices } from '@playwright/test'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Created once in the main process; workers inherit it through the env.
const DATA = (process.env.TRCKABLE_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'trckable-e2e-')))
const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../server/bin/trckabled')

// A site with a few days behind it, so the charts have several buckets at any
// time of day (a fresh site has only "today": one bucket, and just after
// midnight UTC nothing else). Events carry explicit past timestamps, a
// different number of visitors each day, and go in before the server starts.
export const HISTORY_DOMAIN = 'history.example'
const HISTORY = join(DATA, 'history.ndjson')
if (!existsSync(HISTORY)) {
  const noon = Math.floor(Date.now() / 86_400_000) * 86_400_000 + 12 * 3_600_000 // today, 12:00 UTC
  const perDay = [6, 4, 7, 3] // visitors 1, 2, 3 and 4 days ago
  const rows = perDay.flatMap((n, d) =>
    Array.from({ length: n }, (_, i) => JSON.stringify({ ts: new Date(noon - (d + 1) * 86_400_000 + i * 60_000).toISOString(), path: i % 2 ? '/pricing' : '/', visitor: `history-${d}-${i}` })),
  )
  writeFileSync(HISTORY, rows.join('\n') + '\n')
}
export const API = 'http://127.0.0.1:18300'
export const TOKEN = 'e2e-token'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: process.env.CI ? undefined : 2, // keep local runs from maxing out every core
  // CI machines are small and shared: a test gets one more try there, and one
  // that only passes on a retry is reported as flaky (listed, not hidden).
  retries: process.env.CI ? 1 : 0,
  // Nothing hangs silently: a test is cut off at a minute, an action or a page
  // load at less, and a whole run at ten minutes, with what it had done so far.
  timeout: 60_000,
  globalTimeout: process.env.CI ? 10 * 60_000 : undefined,
  // The slowest tests and every retry, at the end of the run and in the job summary.
  reporter: [['list'], ['./slowest.mjs']],
  reportSlowTests: null,
  use: {
    baseURL: 'http://127.0.0.1:18301',
    trace: 'retain-on-failure',
    acceptDownloads: true,
    // The dashboard registers a worker (app-install.spec.ts turns it back on). One that
    // answers a page's requests hides them from page.route(), which the other specs rely on.
    serviceWorkers: 'block',
    actionTimeout: process.env.CI ? 20_000 : undefined,
    navigationTimeout: process.env.CI ? 30_000 : undefined,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      // example.com first (the suite's own site), then the one with history, then the server.
      command: `sh -c '"${BIN}" site add example.com && "${BIN}" site add ${HISTORY_DOMAIN} && "${BIN}" import ${HISTORY_DOMAIN} "${HISTORY}" && exec "${BIN}" serve'`,
      url: `${API}/readyz`,
      reuseExistingServer: false,
      env: {
        TRCKABLE_DATA_DIR: DATA,
        TRCKABLE_ADDR: '127.0.0.1:18300',
        TRCKABLE_SITES: 'example.com',
        TRCKABLE_API_TOKEN: TOKEN,
        TRCKABLE_GEO: 'off',
        TRCKABLE_LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'node serve.mjs',
      url: 'http://127.0.0.1:18301/_site',
      reuseExistingServer: false,
      env: { TRCKABLE_BIN: BIN, TRCKABLE_DATA_DIR: DATA, TRCKABLE_URL: API, SITE_PORT: '18301' },
    },
  ],
})
