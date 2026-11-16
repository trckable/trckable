import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))

describe('the styles of v2', () => {
  it('are each imported by a component, or they never reach the page (the usual-range pill once showed both its texts)', () => {
    const all = files(join(__dirname, '..', '..'))
    const code = all.filter((f) => /\.(tsx?|css)$/.test(f) && !f.includes('.test.')).map((f) => readFileSync(f, 'utf8')).join('\n')
    const loose = all.filter((f) => f.includes('/v2/') && f.endsWith('.css')).filter((f) => !code.includes(f.split('/').pop() ?? f))
    expect(loose).toEqual([])
  })
})
