// One shell for every header menu: the bell, the apps, the account take their frame from kit/PopShell.
// A menu that draws its own background, border, radius, shadow, padding or width fails here; use SHELL and the shell's tokens.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = import.meta.dirname

function files(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return files(join(dir, e.name), ext)
    return e.name.endsWith(ext) && !e.name.includes('.test.') ? [join(dir, e.name)] : []
  })
}

const MENUS: Record<string, string> = {
  'v2/ui/BellMenu.tsx': 'bellmenu',
  'components/AccountMenu.tsx': 'more-menu',
  'v2/explore/SectionsButton.tsx': 'xtiles-pop',
}
// The boxes of those menus, by class: the shell draws their frame, no other rule may.
const BOXES = ['bellmenu', 'more-menu', 'xtiles-pop']
const FRAME = /(^|[;{\s])(background(-color)?|border(-radius)?|box-shadow|padding|width|min-width|max-width|backdrop-filter)\s*:/

describe('header menus share one shell', () => {
  it.each(Object.entries(MENUS))('%s uses the shell', (file, box) => {
    const src = readFileSync(join(SRC, file), 'utf8')
    expect(src).toContain('SHELL')
    expect(src).toContain(box)
  })

  it('no rule draws the frame of a header menu', () => {
    const bad: string[] = []
    for (const f of files(SRC, '.css')) {
      if (f.endsWith('kit/popShell.css')) continue
      for (const [, sel, body] of readFileSync(f, 'utf8').replace(/\/\*[^]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        // A rule aims at the box itself when the last compound of one of its selectors names it.
        // The sheet rules shared by many menus (a list, or an :is() list) are not one menu's frame.
        const itself = !sel.includes(':is(') && !sel.includes('::') && sel.split(',').length === 1 && [sel].some((part) => {
          const last = part.trim().split(/\s+|>/).pop() ?? ''
          return BOXES.some((b) => new RegExp(`\\.${b}(?![\\w-])`).test(last))
        })
        if (itself && FRAME.test(body)) bad.push(`${f.slice(SRC.length + 1)}: ${sel.trim().slice(0, 80)}`)
      }
    }
    expect(bad).toEqual([])
  })
})
