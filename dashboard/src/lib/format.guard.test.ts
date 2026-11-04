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

  // Times of a site's data are written in the site's zone, as Live writes them: these files pass the zone to every formatter.
  it('writes site-data times in the site’s zone', () => {
    const siteTimes = ['features/sitestatus/time.ts', 'features/verified/time.ts', 'features/signals/saleLine.ts', 'features/journey/when.ts', 'v2/bell/days.ts']
    const missing = siteTimes.filter((f) => {
      const src = readFileSync(join(root, f), 'utf8')
      return src.split('dateFmt(').slice(1).some((call) => !call.split('\n')[0].includes('timeZone'))
    })
    expect(missing).toEqual([])
  })
})
