// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { withTrckable } from '../src/next'

describe('withTrckable', () => {
  it('adds the script rewrite and keeps the rest', async () => {
    const cfg = withTrckable({ reactStrictMode: true, rewrites: async () => [{ source: '/a', destination: '/b' }] }, { host: 'https://stats.site.com/' })
    expect(cfg.reactStrictMode).toBe(true)
    expect(await cfg.rewrites!()).toEqual([
      { source: '/a', destination: '/b' },
      { source: '/s/x.js', destination: 'https://stats.site.com/js/t.js' },
    ])
  })
  it('extends the object form of rewrites', async () => {
    const cfg = withTrckable({ rewrites: () => ({ beforeFiles: [{ source: '/a', destination: '/b' }] }) }, { host: 'https://h.com', script: '/q.js' })
    expect(await cfg.rewrites!()).toEqual({ beforeFiles: [{ source: '/a', destination: '/b' }], afterFiles: [{ source: '/q.js', destination: 'https://h.com/js/t.js' }] })
  })
  it('does nothing without a host', () => {
    const cfg = { a: 1 }
    expect(withTrckable(cfg, {})).toBe(cfg)
  })
})
