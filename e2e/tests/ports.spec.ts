// The suite's ports sit at fixed offsets from one base, so two runs on one machine can be given different blocks
// (E2E_PORT_BASE); with none set the block is 18300.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { PORT } from '../ports'

const base = Number(process.env.E2E_PORT_BASE || 18300)

test('every port is an offset from the base, and the server listens on the first', async ({ request }) => {
  expect(PORT.api).toBe(base)
  expect(PORT.site).toBe(base + 1)
  expect(PORT.proxy).toBe(base + 2)
  expect(PORT.onboarding.webkit).toBe(base + 13)
  expect(new URL(API).port).toBe(String(base))
  expect((await request.get(`${API}/readyz`)).ok()).toBe(true)
})
