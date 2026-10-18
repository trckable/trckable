// trckable browser suite: real trckabled + a real site, in Chromium, Firefox
// and WebKit (Safari's engine). Counts are asserted exactly via /api/v1.
import { defineConfig, devices } from '@playwright/test'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PORT, origin } from './ports'

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
  const perDay = [22, 10, 12, 3] // visitors 1, 2, 3 and 4 days ago: enough before a period for a change to be told
  const rows = perDay.flatMap((n, d) =>
    Array.from({ length: n }, (_, i) => JSON.stringify({ ts: new Date(noon - (d + 1) * 86_400_000 + i * 60_000).toISOString(), path: i % 2 ? '/pricing' : '/', visitor: `history-${d}-${i}` })),
  )
  writeFileSync(HISTORY, rows.join('\n') + '\n')
}
// The same days with a crowd on each: the chart's labels with a busy site behind them.
export const BUSY_DOMAIN = 'busy.example'
const BUSY = join(DATA, 'busy.ndjson')
if (!existsSync(BUSY)) {
  const noon = Math.floor(Date.now() / 86_400_000) * 86_400_000 + 12 * 3_600_000
  const perDay = [180, 140, 210, 90, 160, 120]
  const rows = perDay.flatMap((n, d) =>
    Array.from({ length: n }, (_, i) => JSON.stringify({ ts: new Date(noon - (d + 1) * 86_400_000 + i * 60_000).toISOString(), path: i % 3 ? '/pricing' : '/', visitor: `busy-${d}-${i}` })),
  )
  writeFileSync(BUSY, rows.join('\n') + '\n')
}
// A month with a first day of data in the middle (nothing before it), a peak on that first day and on the last, and
// a source behind most rises: the chart's labels with the most in their way.
export const LABELS_DOMAIN = 'labels.example'
const LABELS = join(DATA, 'labels.ndjson')
if (!existsSync(LABELS)) {
  const day = Math.floor(Date.now() / 86_400_000) * 86_400_000
  const perDay: Record<number, [number, string]> = { 0: [160, 'news.ycombinator.com'], 1: [14, 'google.com'], 2: [9, ''], 3: [90, 'google.com'], 4: [11, ''], 5: [10, 'reddit.com'], 6: [70, 'producthunt.com'], 7: [8, ''], 8: [12, 'google.com'], 9: [100, 'news.ycombinator.com'], 10: [9, ''], 11: [10, 'reddit.com'], 12: [75, 'google.com'], 13: [9, ''], 14: [8, ''], 15: [60, 'producthunt.com'], 16: [50, 'google.com'] }
  const rows = Object.entries(perDay).flatMap(([ago, [n, ref]]) =>
    Array.from({ length: n }, (_, i) => JSON.stringify({ ts: new Date(day - Number(ago) * 86_400_000 + 300_000 + i * 1000).toISOString(), path: i % 3 ? '/pricing' : '/', visitor: `labels-${ago}-${i}`, referrer: i % 4 ? ref : '' })),
  )
  writeFileSync(LABELS, rows.join('\n') + '\n')
}
// A week of arrivals from everywhere: ChatGPT (by referrer, and tagged utm_source by an app that sends none or a referrer of its own; the importer is told the channel, as the live classifier would), Claude, Perplexity, and
// plenty that is no AI (Google, Instagram, direct), for Explore's AI view to tell apart.
export const AI_DOMAIN = 'ai.example'
const AI = join(DATA, 'ai.ndjson')
if (!existsSync(AI)) {
  const noon = Math.floor(Date.now() / 86_400_000) * 86_400_000 + 12 * 3_600_000
  const from: [number, string, string][] = [[8, 'chatgpt.com', ''], [4, '', 'chatgpt.com'], [2, 'google.com', 'chatgpt.com'], [2, 'claude.ai', ''], [1, 'perplexity.ai', ''], [9, 'google.com', ''], [3, 'l.instagram.com', ''], [6, '', '']]
  const rows = from.flatMap(([n, referrer, source], k) =>
    Array.from({ length: n }, (_, i) => JSON.stringify({ ts: new Date(noon - 86_400_000 + (k * 20 + i) * 60_000).toISOString(), path: '/', visitor: `ai-${k}-${i}`, referrer, source, channel: k < 5 ? 'AI' : '' })),
  )
  writeFileSync(AI, rows.join('\n') + '\n')
}
export const API = origin(PORT.api)
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
    baseURL: origin(PORT.site),
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
      command: `sh -c '"${BIN}" site add example.com && "${BIN}" site add ${HISTORY_DOMAIN} && "${BIN}" import ${HISTORY_DOMAIN} "${HISTORY}" && "${BIN}" site add ${BUSY_DOMAIN} && "${BIN}" import ${BUSY_DOMAIN} "${BUSY}" && "${BIN}" site add ${LABELS_DOMAIN} && "${BIN}" import ${LABELS_DOMAIN} "${LABELS}" && "${BIN}" site add ${AI_DOMAIN} && "${BIN}" import ${AI_DOMAIN} "${AI}" && exec "${BIN}" serve'`,
      url: `${API}/readyz`,
      reuseExistingServer: false,
      env: {
        TRCKABLE_DATA_DIR: DATA,
        TRCKABLE_ADDR: `127.0.0.1:${PORT.api}`,
        TRCKABLE_SITES: 'example.com',
        TRCKABLE_API_TOKEN: TOKEN,
        TRCKABLE_GEO: 'off',
        TRCKABLE_MENTIONS: 'on', // the specs fake the answers; the search itself stays off
        TRCKABLE_MENTIONS_EVERY: '0',
        TRCKABLE_LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'node serve.mjs',
      url: `${origin(PORT.site)}/_site`,
      reuseExistingServer: false,
      env: { TRCKABLE_BIN: BIN, TRCKABLE_DATA_DIR: DATA, TRCKABLE_URL: API, SITE_PORT: String(PORT.site), PROXY_PORT: String(PORT.proxy) },
    },
  ],
})
