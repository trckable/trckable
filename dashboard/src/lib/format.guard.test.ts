import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Dates and times are formatted through dateFmt in lib/format.ts and nowhere else
// (i18n/intl.ts is the loader of another language's forms and may not import it).

const root = join(__dirname, '..')
const allowed = new Set(['lib/format.ts', 'i18n/intl.ts'])
const banned = /\.toLocale(?:Date|Time)String\(|new Intl\.DateTimeFormat\(|\bIntl\.DateTimeFormat\(/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('date formatting', () => {
  it('goes through dateFmt in lib/format.ts', () => {
    const strays = files(root)
      .map((f) => relative(root, f))
      .filter((f) => !allowed.has(f))
      .filter((f) => banned.test(readFileSync(join(root, f), 'utf8')))
    expect(strays).toEqual([])
  })
})
