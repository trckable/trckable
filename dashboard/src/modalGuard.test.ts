// One dialog: every role="dialog" that is a modal is rendered by kit/Modal, and the surface it draws is solid.
// A dialog written by hand (its own backdrop, its own surface) fails this; use <Modal> and its `frame`.
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

// Not modals: anchored pop-overs, menus and sheets that sit beside the page and do not hold it. Each is a known
// exception; a new modal does not belong on this list.
const NOT_MODAL = new Set([
  'kit/Modal.tsx',
  'features/markers/SourceMarkers.tsx',
  'features/sitestatus/Blocked.tsx',
  'v2/setup/SetupRing.tsx',
  'v2/live/globe/GlobePopover.tsx',
  'components/AnchoredPop.tsx',
  'components/ShortcutsHost.tsx',
  'features/hints/HintHost.tsx',
])
// Full-screen surfaces of the dashboard's own (a palette, a drawer, the first-run page): not dialogs of the Modal kind.
const OWN_SURFACE = new Set(['features/mentions/Detail.tsx', 'features/onboarding/Onboarding.tsx', 'v2/ui/Palette.tsx', 'v2/ui/BellMenu.tsx'])

describe('dialogs', () => {
  it('render only through kit/Modal', () => {
    const stray = files(SRC, '.tsx')
      .map((f) => f.slice(SRC.length + 1))
      .filter((f) => !NOT_MODAL.has(f) && !OWN_SURFACE.has(f))
      .filter((f) => /role="dialog"|<dialog\b|aria-modal/.test(readFileSync(join(SRC, f), 'utf8')))
    expect(stray).toEqual([])
  })

  it('draw a solid surface, with no translucency or blur on it', () => {
    const tokens = readFileSync(join(SRC, 'styles.css'), 'utf8')
    const defs = [...tokens.matchAll(/--modal-surface:\s*([^;]+);/g)].map((m) => m[1].trim())
    expect(defs.length).toBeGreaterThanOrEqual(3)
    for (const d of defs) expect(d).toMatch(/^#[0-9a-f]{6}\b/i)
    const css = readFileSync(join(SRC, 'kit/Modal.css'), 'utf8')
    const rule = css.match(/\n\.modal \{[^}]*\}/)?.[0] ?? ''
    expect(rule).toContain('background: var(--modal-surface)')
    expect(rule).not.toContain('backdrop-filter')
  })
})
