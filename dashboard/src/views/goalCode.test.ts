import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { goalCode } from './goalCode'

const site = { id: 'tkb_a1b2c3d4', domain: 'example.com' }

describe('the code Track a goal shows', () => {
  it('writes a goal property the way the tracker reads it', () => {
    const html = goalCode('https://stats.example.com', site).html
    const attrs = [...html.matchAll(/ (data-trckable-[a-z-]+)=/g)].map((m) => m[1]).filter((a) => a !== 'data-trckable-goal')
    expect(attrs).toEqual(['data-trckable-goal-plan'])
    // The tracker takes every dataset key that starts with trckableGoal as a property.
    const tracker = readFileSync(new URL('../../../tracker/src/core.ts', import.meta.url), 'utf8')
    expect(tracker).toContain('/^trckableGoal./')
    const key = attrs[0].slice('data-'.length).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    expect(/^trckableGoal./.test(key)).toBe(true)
  })
  it('puts this site and server in the API example', () => {
    const api = goalCode('https://stats.example.com', site).api
    expect(api).toContain('https://stats.example.com/api/e')
    expect(api).toContain('"s":"tkb_a1b2c3d4"')
    expect(api).toContain('https://example.com/welcome')
    // The ingest address reads k (g for a goal), n, p and v; a browser-like user agent keeps it from being dropped as a bot.
    expect(api).toContain('"k":"g"')
    expect(api).toContain('"v":')
    expect(api).toContain("-H 'user-agent:")
  })
})
