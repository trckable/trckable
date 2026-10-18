// The ports the suite listens on. All sit at a fixed offset from one base, so two
// runs on one machine (two checkouts, two agents) do not collide: set E2E_PORT_BASE
// to move the whole block (default 18300; the block is 30 ports wide).
const base = Number(process.env.E2E_PORT_BASE || 18300)

export const PORT = {
  api: base, // trckabled
  site: base + 1, // the test site
  proxy: base + 2, // the forward proxy for real domain names
  onboarding: { chromium: base + 11, firefox: base + 12, webkit: base + 13 } as Record<string, number>,
  onboardingMore: { chromium: base + 21, firefox: base + 22, webkit: base + 23 } as Record<string, number>,
}

export const origin = (port: number) => `http://127.0.0.1:${port}`
