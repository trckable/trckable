// Smoke test of the WordPress plugin: a real WordPress (PHP's server, SQLite)
// with the plugin installed from the built zip, and a stand-in trckable server.
// Set it up first: integrations/wordpress/tests/setup.sh <dir>, then
//   WP_DIR=<dir> pnpm exec playwright test -c wordpress/wordpress.config.ts --project=chromium --workers=1
import { defineConfig, devices } from '@playwright/test'
import { join } from 'node:path'

const WP_DIR = process.env.WP_DIR ?? ''
const WP_PORT = process.env.WP_PORT ?? '19401'
const MOCK_PORT = process.env.MOCK_PORT ?? '19400'

export default defineConfig({
  testDir: '.',
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${WP_PORT}`, serviceWorkers: 'block' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `php -d memory_limit=512M -S 127.0.0.1:${WP_PORT} -t "${join(WP_DIR, 'wordpress')}"`,
      url: `http://127.0.0.1:${WP_PORT}/wp-login.php`,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore', // PHP's server logs every request
      env: { PHP_CLI_SERVER_WORKERS: '4' },
    },
    { command: 'node mock-trckable.mjs', url: `http://127.0.0.1:${MOCK_PORT}/__seen`, reuseExistingServer: !process.env.CI, env: { MOCK_PORT } },
  ],
})
