// One source for every snippet: install.ts. This holds everything else to it.
//
// install.snippets.json is every method's code for the placeholder values the
// docs use (the site's docs build rewrites its marked code blocks from
// this file and fails on any unmarked one that drifts). The READMEs and
// `npx trckable init` are held to the same tag here.
//
// After changing a snippet: UPDATE_SNIPPETS=1 pnpm --dir dashboard test install.canon
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { scriptTag } from '../../../packages/trckable/src/init'
import { METHODS, tag, type Ctx } from './install'

const ROOT = new URL('../../../', import.meta.url)
const FILE = new URL('./install.snippets.json', import.meta.url)

/** The values every snippet in the docs and READMEs is written with. */
export const CANON: Ctx = { host: 'https://stats.example.com', site: 'tkb_a1b2c3d4', domain: 'example.com', proxyKey: 'your-proxy-key' }

const canonical = () => ({
  ctx: CANON,
  methods: Object.fromEntries(
    METHODS.map((m) => [m.id, { name: m.name, code: m.code(CANON), ...(m.steps ? { steps: m.steps(CANON).map((s) => s.code) } : {}) }]),
  ),
})

describe('canonical snippets', () => {
  it('install.snippets.json is what install.ts writes', () => {
    const now = JSON.stringify(canonical(), null, 2) + '\n'
    if (process.env.UPDATE_SNIPPETS) writeFileSync(FILE, now)
    expect(readFileSync(FILE, 'utf8'), 'run UPDATE_SNIPPETS=1 pnpm --dir dashboard test install.canon').toBe(now)
  })

  it('every script tag in the READMEs is the canonical one', () => {
    for (const f of ['README.md', 'packages/trckable/README.md']) {
      const md = readFileSync(new URL(f, ROOT), 'utf8')
      const tags = md.match(/<script[\s\S]*?<\/script>/g) ?? []
      expect(tags.length, f).toBeGreaterThan(0)
      for (const t of tags) expect(t, f).toBe(tag(CANON))
    }
  })

  it('npx trckable init writes the same tag', () => {
    expect(scriptTag(CANON)).toBe(tag(CANON))
    expect(scriptTag(CANON, '    ')).toBe(tag(CANON, '    '))
  })

  it('every method names the site: its id, and data-domain on every tag', () => {
    for (const m of METHODS) {
      const code = m.code(CANON)
      expect(code, m.id).toContain(CANON.site)
      for (const t of code.match(/<script[^>]*?(?:\/>|>)/g) ?? []) {
        if (!/src=/.test(t)) continue
        expect(t, m.id).toContain('data-site="tkb_a1b2c3d4"')
        expect(t, m.id).toContain('data-domain="example.com"')
      }
      for (const o of code.match(/\{ src: [^}]*\}/g) ?? []) expect(o, m.id).toContain("'data-domain': 'example.com'")
    }
  })
})
