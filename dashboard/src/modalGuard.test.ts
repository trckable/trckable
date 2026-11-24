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
  'features/signals/SurgeBand.tsx',
])
// Full-screen surfaces of the dashboard's own (a palette, a drawer, the first-run page): not dialogs of the Modal kind.
const OWN_SURFACE = new Set(['v2/explore/Rail.tsx', 'features/mentions/Detail.tsx', 'features/onboarding/Onboarding.tsx', 'v2/ui/Palette.tsx', 'v2/ui/BellMenu.tsx', 'v2/briefing/ChartBlock.tsx'])

// A <Modal> without a frame brings its own header and footer. Each one left is named with the reason it cannot use the
// frame today: its header or footer carries the dialog's live content, or the dialog is a layout of its own.
const OWN_CHROME: Record<string, string> = {
  'components/Window.tsx': 'settings and profile: a left-nav window whose header is the section head',
  'features/journey/JourneyDialog.tsx': 'the visit story: its header is the person, with a menu in the corner',
  'features/signals/SurgeModal.tsx': 'the surge hero: a live count is the header',
  'features/bounce/BounceGuideModal.tsx': 'the bounce guide: a hero header like the surge dialog',
  'features/heatmap/HeatOverlay.tsx': 'the heatmap: its header is the toolbar (page, width, layers)',
  'features/share/ShareDialog.tsx': 'the share studio: a header with the site and the links corner, a body of three columns held at one size',
  'features/milestones/ShareSheet.tsx': 'a two-column sheet: the card and its side actions share one grid',
  'features/milestones/Timeline.tsx': 'the milestones window: its own scroll region and a full screen on a phone',
  'components/CardModal/CardModal.tsx': 'a story card: tinted kind header and its own action row',
  'v2/bell/EventCard.tsx': 'the event card: its header is the event, with a corner close, and its one action is the row\'s own link',
  'v2/bell/GoalsStory.tsx': 'the goals card: the day\'s goals beside one goal\'s times, a full sheet with a way back on a phone',
  'v2/explore/views/hosted/CustomerSheet.tsx': 'the customer sheet: its header is the customer (name, email, country) and it is a bottom sheet on a phone',
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

  it('sit over the page: one shared backdrop, and nothing puts the page away while a dialog is open', () => {
    const css = readFileSync(join(SRC, 'kit/Modal.css'), 'utf8')
    const back = css.match(/\n\.modal-back \{[^}]*\}/)?.[0] ?? ''
    expect(back).toContain('background: rgba(0, 0, 0, 0.25)')
    expect(back).toContain('backdrop-filter: blur(4px)')
    // A dialog dims and blurs the page; it never hides, empties or inerts it (the Explore panel, the Briefing's sheets, a list).
    expect(readFileSync(join(SRC, 'kit/Modal.tsx'), 'utf8')).not.toMatch(/dataset\.modal|body\.setAttribute|body\.inert/)
    const all = [...files(SRC, '.css'), ...files(SRC, '.tsx'), ...files(SRC, '.ts')].filter((f) => !f.endsWith('modalGuard.test.ts'))
    const hiding = all.filter((f) => /body\[data-modal\]|body:has\(\.modal-back[^)]*\)[^{]*\{[^}]*(visibility|display|opacity)/.test(readFileSync(f, 'utf8')))
    expect(hiding.map((f) => f.slice(SRC.length + 1))).toEqual([])
  })

  it('have one fixed size per size class, held in kit/Modal.css, and no dialog sets a height of its own', () => {
    const css = readFileSync(join(SRC, 'kit/Modal.css'), 'utf8')
    // The one place: each class a fixed height, capped by the screen, and the frame's body is what scrolls.
    for (const [size, px] of [['sm', 560], ['md', 620], ['lg', 680]] as const) {
      const rule = css.match(new RegExp(`\\.modal\\.framed\\.modal-${size} \\{[^}]*\\}`))?.[0] ?? ''
      expect(rule).toContain(`--modal-h: ${px}px`)
    }
    const frame = css.match(/\n\.modal\.framed \{[^}]*\}/)?.[0] ?? ''
    expect(frame).toContain('height: min(var(--modal-h), calc(100dvh - 32px))')
    expect(css.match(/\n\.modal-body \{[^}]*\}/)?.[0]).toContain('overflow-y: auto')
    expect(css.match(/\n\.modal-head \{[^}]*\}/)?.[0]).toContain('flex: none')
    expect(css.match(/\n\.modal-foot \{[^}]*\}/)?.[0]).toContain('flex: none')

    // Every dialog that uses the frame (all but the named ones that keep their own layout).
    const framed = files(SRC, '.tsx')
      .map((f) => f.slice(SRC.length + 1))
      .filter((f) => f !== 'kit/Modal.tsx' && !(f in OWN_CHROME))
      .filter((f) => /<Modal\b/.test(readFileSync(join(SRC, f), 'utf8')))
    const classes = new Set(['framed'])
    for (const f of framed)
      for (const m of readFileSync(join(SRC, f), 'utf8').matchAll(/<Modal\b[^>]*?className="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => classes.add(c))
    const own: string[] = []
    for (const f of files(SRC, '.css')) {
      const rel = f.slice(SRC.length + 1)
      if (rel === 'kit/Modal.css') continue
      for (const m of readFileSync(f, 'utf8').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        // The dialog's own box (a selector that ends on .modal), not something inside it.
        const mine = m[1].split(',').some((sel) => /\.modal(\.[\w-]+)*\s*$/.test(sel) && sel.split('.').some((c) => classes.has(c.trim().split(/[\s:]/)[0])))
        if (mine && /(^|[;\s])(min-|max-)?height\s*:/.test(m[2])) own.push(`${rel}: ${m[1].trim()}`)
      }
    }
    expect(own).toEqual([])
    // The height easing is gone: a dialog never changes size while open.
    expect(readFileSync(join(SRC, 'kit/Modal.tsx'), 'utf8')).not.toMatch(/keepSize|useGlide/)
  })
})
