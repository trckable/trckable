// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { doctor, format } from '../src/doctor'

afterEach(() => vi.restoreAllMocks())

const reply = (routes: Record<string, { status?: number; body?: string; headers?: Record<string, string> }>) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input)
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) throw new Error('unreachable: ' + url)
    const r = routes[key]
    return new Response(r.body ?? '', { status: r.status ?? 200, headers: r.headers })
  })

describe('doctor', () => {
  it('passes a healthy install and explains a cookieless script', async () => {
    reply({
      '/healthz': { headers: { 'x-trckable-version': 'v1.0.0' } },
      '/js/tkb_1.js': { body: "document.currentScript.dataset.cookieless='';(function(){})()" },
      '/api/e': { headers: { 'access-control-allow-origin': '*' } },
      '/_trckable/whoami': { body: JSON.stringify({ ip: '203.0.113.7', forwarded: true }) },
      'https://example.com': { body: '<script defer src="https://stats.example.com/js/tkb_1.js"></script>' },
    })
    const checks = await doctor({ host: 'https://stats.example.com', site: 'tkb_1', url: 'https://example.com' })
    expect(checks.every((c) => c.ok)).toBe(true)
    expect(checks.find((c) => c.name === 'Script')?.detail).toContain('cookieless')
    expect(format(checks)).toContain('Everything looks right.')
  })

  it('stops at the first thing that matters and says how to fix it', async () => {
    reply({ '/healthz': { status: 502 } })
    const checks = await doctor({ host: 'https://stats.example.com', site: 'tkb_1' })
    expect(checks).toHaveLength(1)
    expect(checks[0].ok).toBe(false)
    expect(checks[0].fix).toMatch(/TRCKABLE_HOST/)
  })

  it('warns about plain http, because Safari drops the cookie', async () => {
    reply({
      '/healthz': {},
      '/js/tkb_1.js': { body: 'x' },
      '/api/e': { headers: { 'access-control-allow-origin': '*' } },
      '/_trckable/whoami': { body: JSON.stringify({ ip: '203.0.113.7' }) },
    })
    const checks = await doctor({ host: 'http://stats.example.com', site: 'tkb_1' })
    const https = checks.find((c) => c.name === 'HTTPS')!
    expect(https.ok).toBe(false)
    expect(https.fix).toMatch(/https/)
  })

  it('notices a missing snippet on a real page', async () => {
    reply({
      '/healthz': {},
      '/js/tkb_1.js': { body: 'x' },
      '/api/e': { headers: { 'access-control-allow-origin': '*' } },
      '/_trckable/whoami': { body: JSON.stringify({ ip: '203.0.113.7' }) },
      'https://example.com': { body: '<html><head><title>no analytics here</title></head></html>' },
    })
    const checks = await doctor({ host: 'https://stats.example.com', site: 'tkb_1', url: 'https://example.com' })
    expect(checks.find((c) => c.name === 'Snippet')?.ok).toBe(false)
  })
})
