// One place decides the widths (kit/breakpoints.ts). The v2 pages and their shared look (mock/) write a width in a media or
// container query as a token, `@media (--sm-up)`, and in a script as QUERY[...]: never as pixels. The older screens' queries are
// counted in kit/legacyQueries.json, and that count may only go down: a new one, or a new file with one, fails this.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import legacy from './kit/legacyQueries.json'
import { BP, PANE, QUERY, STEPS } from './kit/breakpoints'

const SRC = import.meta.dirname
const STRICT = /^(v2|mock)\//
const SCRIPTS = /^(v2|kit)\//
const RAW = /@(?:media|container)[^{]*\((?:min|max)-(?:width|height)\s*:\s*[\d.]+px\)/g
const RAW_SCRIPT = /matchMedia\(\s*['"`][^'"`]*(?:min|max)-width/g

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
}
const files = walk(SRC).map((f) => ({ path: f.slice(SRC.length + 1), text: readFileSync(f, 'utf8') }))
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

describe('widths are written once', () => {
  it('no raw pixel query in the v2 pages or the shared look', () => {
    const bad = files.filter((f) => f.path.endsWith('.css') && STRICT.test(f.path)).flatMap((f) => (noComments(f.text).match(RAW) ?? []).map((m) => `${f.path}: ${m.trim()}`))
    expect(bad, 'write the width as a token from kit/breakpoints.ts, e.g. @media (--sm-up)').toEqual([])
  })
  it('no matchMedia with a pixel width in a script of the v2 pages or the kit', () => {
    const bad = files.filter((f) => /\.tsx?$/.test(f.path) && SCRIPTS.test(f.path) && !/\.test\.tsx?$|^kit\/breakpoints\.ts$/.test(f.path)).flatMap((f) => (f.text.match(RAW_SCRIPT) ?? []).map((m) => `${f.path}: ${m}`))
    expect(bad, "ask QUERY['sm-up'] (kit/breakpoints.ts)").toEqual([])
  })
  it('the older screens have no more raw queries than they had', () => {
    const had = legacy as Record<string, number>
    const more = files
      .filter((f) => f.path.endsWith('.css') && !STRICT.test(f.path))
      .flatMap((f) => {
        const n = (noComments(f.text).match(RAW) ?? []).length
        return n > (had[f.path] ?? 0) ? [`${f.path}: ${n}, was ${had[f.path] ?? 0}`] : []
      })
    expect(more, 'use a width token (kit/breakpoints.ts); if you took one out, lower kit/legacyQueries.json').toEqual([])
  })
  it('every token a stylesheet uses is one the module defines', () => {
    const used = files.filter((f) => f.path.endsWith('.css')).flatMap((f) => [...noComments(f.text).matchAll(/@(?:media|container)[^{]*\(--([a-z0-9-]+)\)/g)].map((m) => `${f.path}: --${m[1]}`))
    const unknown = used.filter((u) => !(u.split('--')[1] in QUERY || u.split('--')[1] in PANE))
    expect(unknown).toEqual([])
  })
  it('the steps run in order and the queries meet without a gap', () => {
    expect(STEPS.map((s) => BP[s])).toEqual([...STEPS.map((s) => BP[s])].sort((a, b) => a - b))
    expect(QUERY.xs).toBe(`(max-width: ${BP.sm - 0.02}px)`)
    expect(QUERY['sm-up']).toBe(`(min-width: ${BP.sm}px)`)
  })
})
