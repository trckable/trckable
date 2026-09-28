import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GHOST } from '../../brand/logo'
import { copy } from './copy'
import { bootHtml, markHtml, PX } from './markup'

const css = readFileSync(new URL('./Loading.css', import.meta.url), 'utf8')

describe('loading ghost', () => {
  it('announces itself as a busy status with the copy file’s words', () => {
    const html = bootHtml(copy.boot)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain(`aria-label="${copy.boot}"`)
    expect(html).toContain('ld-page')
  })

  it('draws the logo’s own ghost at each size', () => {
    for (const size of ['inline', 'block', 'page'] as const) {
      expect(markHtml(size)).toContain(`width="${PX[size]}"`)
      expect(markHtml(size)).toContain(`d="${GHOST}"`)
    }
  })

  it('gives each size its own choreography', () => {
    expect(markHtml('page')).toContain('ld-trace')
    expect(markHtml('page')).toContain('ld-dots')
    expect(markHtml('page')).toContain('ld-name')
    expect(markHtml('block')).toContain('ld-bars')
    expect(markHtml('block')).not.toContain('ld-trace')
    expect(markHtml('inline')).not.toContain('ld-bars')
  })

  it('escapes the label', () => {
    expect(bootHtml('a"<b')).toContain('aria-label="a&quot;&lt;b"')
  })

  it('animates only without reduced motion: still, the composed frame', () => {
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, '')
    expect(outside).not.toMatch(/animation/)
    expect(outside).not.toMatch(/transition/)
  })

  it('animates only transform, opacity and stroke-dashoffset (the compositor’s)', () => {
    const frames = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\n\}/g)].map((m) => m[1])
    expect(frames.length).toBeGreaterThanOrEqual(10)
    for (const f of frames) {
      const props = [...f.matchAll(/^\s+([a-z-]+):/gm)].map((m) => m[1])
      expect(props.length).toBeGreaterThan(0)
      for (const p of props) expect(['transform', 'opacity', 'stroke-dashoffset']).toContain(p)
    }
  })

  it('loops within 1.8 to 3 seconds at every size', () => {
    const loops = [...css.matchAll(/--ld-t: ([\d.]+)s/g)].map((m) => Number(m[1]))
    expect(loops.length).toBe(3)
    for (const t of loops) expect(t >= 1.8 && t <= 3).toBe(true)
  })
})
