import { describe, expect, it } from 'vitest'

// The site-less Settings page is gone: nothing in the app may send anyone to
// an address that begins /settings. Only the router (main.tsx) names it, to
// turn an old link into a site's settings dialog or the main dashboard.
const files = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })

describe('no in-app link to /settings', () => {
  it('names the path only in the router', () => {
    const hits = Object.entries(files)
      .filter(([name]) => !name.endsWith('.test.ts') && !name.endsWith('main.tsx'))
      .filter(([, src]) => /['"`]\/settings[?'"`]/.test(src))
      .map(([name]) => name)
    expect(hits).toEqual([])
  })
})
