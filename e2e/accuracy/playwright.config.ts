// The accuracy suite: scripted visitors with known truth, in Chromium, Firefox
// and WebKit, against a real trckabled. Every scenario states its numbers
// beforehand and the report must agree exactly (only time is a range).
//
//   cd e2e && npx playwright test -c accuracy/playwright.config.ts --project=chromium
//
// Each worker starts its own trckabled, so scenarios never see each other.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './scenarios',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 1,
  // No second chances: a count that is wrong once is wrong.
  retries: 0,
  timeout: 90_000,
  globalTimeout: process.env.CI ? 12 * 60_000 : undefined,
  reporter: [['list'], ['./score.mjs']],
  use: {
    trace: 'retain-on-failure',
    actionTimeout: process.env.CI ? 20_000 : undefined,
    navigationTimeout: process.env.CI ? 30_000 : undefined,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
