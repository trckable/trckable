// Fields have no border, no outline and no coloured ring: one look, in src/field.css. A rule outside that file that gives an
// input, textarea, select, search box or field wrapper a border, an outline or a box-shadow (or a colour for one) fails this.
// Put the look in field.css; take the rule out of the screen's CSS.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = import.meta.dirname

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return cssFiles(join(dir, e.name))
    return e.name.endsWith('.css') ? [join(dir, e.name)] : []
  })
}

const sheets = Object.fromEntries(cssFiles(SRC).map((f) => [f.slice(SRC.length), readFileSync(f, 'utf8')]))

const FIELD = /(^|[^\w-])(input|textarea|select)([^\w-]|$)|\.input\b|[\w]-input\b|-field\b|\.field\b|-search\b|\.an-in\b|\.wg-name\b/
const NOT_TEXT = /type=['"]?(range|checkbox|radio|color|file)|::-webkit-slider|::-moz-range|::-webkit-(file|color)|:checked/
const PROP = /^(-webkit-)?(border(-(top|right|bottom|left))?(-(width|style|color))?|outline(-color|-width|-style)?|box-shadow)$/
const OFF = /^(none|0|0px|0 none|transparent|unset|inherit|initial)$/

type Hit = { file: string; selector: string; decl: string }

function strip(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Every { ... } block with no block inside it, with the selector before it.
function blocks(css: string) {
  const out: { selector: string; body: string }[] = []
  let i = 0
  for (;;) {
    const open = css.indexOf('{', i)
    if (open < 0) break
    const close = css.indexOf('}', open)
    const next = css.indexOf('{', open + 1)
    if (next >= 0 && next < close) {
      i = open + 1
      continue
    }
    const start = Math.max(css.lastIndexOf('}', open), css.lastIndexOf('{', open - 1), css.lastIndexOf(';', open)) + 1
    out.push({ selector: css.slice(start, open).trim(), body: css.slice(open + 1, close) })
    i = close + 1
  }
  return out
}

export function fieldHits(file: string, css: string): Hit[] {
  const hits: Hit[] = []
  for (const { selector, body } of blocks(strip(css))) {
    const parts = selector.split(',').map((s) => s.trim()).filter((s) => FIELD.test(s) && !NOT_TEXT.test(s))
    if (!parts.length) continue
    for (const d of body.split(';')) {
      const at = d.indexOf(':')
      if (at < 0) continue
      const prop = d.slice(0, at).trim()
      const value = d.slice(at + 1).replace(/\s*!important/, '').trim()
      if (PROP.test(prop) && !OFF.test(value)) hits.push({ file, selector: parts.join(', '), decl: `${prop}: ${value}` })
    }
  }
  return hits
}

describe('fields', () => {
  const files = Object.entries(sheets).filter(([f]) => f !== '/field.css')

  it('is found in the sheets it is guarded over', () => {
    expect(files.length).toBeGreaterThan(60)
    expect(sheets['/field.css']).toContain('--field-fill')
  })

  it('has no border, outline or box-shadow outside src/field.css', () => {
    const hits = files.flatMap(([f, css]) => fieldHits(f, css))
    expect(hits, 'fields are styled in src/field.css only: no border, no outline, no coloured ring').toEqual([])
  })

  it('catches a bordered field', () => {
    expect(fieldHits('x.css', '.foo input { border: 1px solid red }')).toHaveLength(1)
    expect(fieldHits('x.css', '.my-field:focus-within { box-shadow: 0 0 0 2px lime; outline: 2px solid red }')).toHaveLength(2)
    expect(fieldHits('x.css', '.foo input { border: 0; outline: none; border-radius: 8px; box-shadow: none }')).toHaveLength(0)
    expect(fieldHits('x.css', 'input[type=range]::-webkit-slider-thumb { border: 3px solid red }')).toHaveLength(0)
  })
})
