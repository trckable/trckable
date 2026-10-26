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

// A <Modal> without a frame brings its own header and footer. Each one left is named with the reason it cannot use the
// frame today: its header or footer carries the dialog's live content, or the dialog is a layout of its own.
const OWN_CHROME: Record<string, string> = {
  'components/Window.tsx': 'settings and profile: a left-nav window whose header is the section head',
  'features/journey/JourneyDialog.tsx': 'the visit story: its header is the visitor, with a menu in the corner',
  'features/signals/SurgeModal.tsx': 'the surge hero: a live count is the header',
  'features/bounce/BounceGuideModal.tsx': 'the bounce guide: a hero header like the surge dialog',
  'features/heatmap/HeatOverlay.tsx': 'the heatmap: its header is the toolbar (page, width, layers)',
  'features/share/ShareDialog.tsx': 'the share image: header carries the period and link switches, body is a preview grid',
  'features/milestones/ShareSheet.tsx': 'a two-column sheet: the card and its side actions share one grid',
  'features/milestones/Timeline.tsx': 'the milestones window: its own scroll region and a full screen on a phone',
  'components/CardModal/CardModal.tsx': 'a story card: tinted kind header and its own action row',
}

describe('dialogs', () => {
  it('use the frame unless they are a named exception', () => {
    const bare = files(SRC, '.tsx')
      .map((f) => f.slice(SRC.length + 1))
      .filter((f) => f !== 'kit/Modal.tsx' && !(f in OWN_CHROME))
      .filter((f) => /<Modal\b/.test(readFileSync(join(SRC, f), 'utf8')) && !/frame[={]/.test(readFileSync(join(SRC, f), 'utf8')))
    expect(bare).toEqual([])
  })

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
    // The glass (kit/glass.css) once gave dialogs its translucent pop fill: the page read through the words.
    const glass = readFileSync(join(SRC, 'kit/glass.css'), 'utf8')
    expect(glass).not.toMatch(/:is\([^)]*\.modal[,)][^{]*\{[^}]*background/)
    const css = readFileSync(join(SRC, 'kit/Modal.css'), 'utf8')
    const rule = css.match(/\n\.modal \{[^}]*\}/)?.[0] ?? ''
    expect(rule).toContain('background: var(--modal-surface)')
    expect(rule).not.toContain('backdrop-filter')
  })
})
