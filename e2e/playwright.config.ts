// trckable browser suite: real trckabled + a real site, in Chromium, Firefox
// and WebKit (Safari's engine). Counts are asserted exactly via /api/v1.
import { defineConfig, devices } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Created once in the main process; workers inherit it through the env.
const DATA = (process.env.TRCKABLE_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'trckable-e2e-')))
const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../server/bin/trckabled')
export const API = 'http://127.0.0.1:18300'
export const TOKEN = 'e2e-token'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:18301', trace: 'retain-on-failure', acceptDownloads: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: `${BIN} serve`,
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
