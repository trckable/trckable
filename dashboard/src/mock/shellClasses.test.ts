// A feature's own stylesheet must not style one of the dashboard shell's class names unscoped: the rule then lands
// on every screen that uses that name. 19 Nov 2026: the limit sheet's `.lhero` gave Live's Analytics number a green
// panel. Give a feature's classes its own prefix (lim-hero, ist-…) instead.
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
/** Shared on purpose: a feature restyles the shell's own control. Add a name only after checking every screen that uses it. */
const SHARED = new Set(['account-btn', 'vf-sealbtn', 'site-group', 'site-head', 'site-row', 'site-section', 'sites-none'])

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : cssFiles(p)
    return p.endsWith('.css') ? [p] : []
  })
}

/** The class names a stylesheet styles unscoped: a selector that starts with the class. */
export function bareClasses(css: string): string[] {
  const out: string[] = []
  for (const m of strip(css).matchAll(/(?:^|[},])\s*([^{}@]+)\{/g)) {
    for (const sel of m[1].split(',')) {
      const c = sel.trim().match(/^\.([a-zA-Z_][\w-]*)(?![\w-])/)?.[1]
      if (c) out.push(c)
    }
  }
  return out
}

describe('feature stylesheets and the shell', () => {
  it('finds an unscoped class, not a scoped one', () => {
    expect(bareClasses('.lhero { color: red }\nmain .lbig { color: red }')).toEqual(['lhero'])
  })

  it('no feature styles a shell class name unscoped', () => {
    const shell = new Set([...strip(readFileSync(join(SRC, 'mock/mock.css'), 'utf8')).matchAll(/\.mk \.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]))
    const clashes = new Set<string>()
    for (const f of cssFiles(SRC)) {
      const rel = relative(SRC, f)
      if (!/^(features|views|components)\//.test(rel)) continue
      for (const c of bareClasses(readFileSync(f, 'utf8'))) if (shell.has(c) && !SHARED.has(c)) clashes.add(`${rel}: .${c}`)
    }
    expect([...clashes]).toEqual([])
  })
})
