import { FileCheck, Server } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DialogActions } from './DialogActions'
import { DialogHead } from './DialogHead'
import { Field } from './Field'
import { OptionCards } from './OptionCards'

const OPTIONS = [
  { id: 'a', label: 'Page visit', hint: 'No code', icon: FileCheck },
  { id: 'b', label: 'Your server', hint: 'One call', icon: Server },
]

describe('OptionCards', () => {
  const html = renderToStaticMarkup(<OptionCards label="How" options={OPTIONS} value="b" onChange={() => {}} />)

  it('is one radio group with one radio per option', () => {
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('aria-label="How"')
    expect(html.match(/role="radio"/g)).toHaveLength(2)
  })

  it('checks the chosen card and puts only it in the tab order', () => {
    expect(html).toMatch(/aria-checked="false" tabindex="-1"[^>]*>.*?Page visit/)
    expect(html).toMatch(/aria-checked="true" tabindex="0"[^>]*>.*?Your server/)
  })

  it('shows a label and a one-line hint on each card', () => {
    for (const t of ['Page visit', 'No code', 'Your server', 'One call']) expect(html).toContain(t)
  })
})

describe('DialogHead', () => {
  it('is the title, one line, and a tooltip for the rest', () => {
    const html = renderToStaticMarkup(<DialogHead heading="Track a goal" hint="Count a signup." help="More words" />)
    expect(html).toContain('<h2>Track a goal')
    expect(html).toContain('Count a signup.')
    expect(html).toContain('class="info-dot"')
  })

  it('needs nothing but a title', () => {
    const html = renderToStaticMarkup(<DialogHead heading="Note" />)
    expect(html).not.toContain('info-dot')
    expect(html).not.toContain('faint')
  })
})

describe('DialogActions', () => {
  it('puts the quiet button before the primary, in one row', () => {
    const html = renderToStaticMarkup(
      <DialogActions left={<button className="btn ghost">Cancel</button>}>
        <button className="btn primary">Save</button>
      </DialogActions>,
    )
    expect(html.indexOf('Cancel')).toBeLessThan(html.indexOf('Save'))
    expect(html.match(/class="dialog-actions"/g)).toHaveLength(1)
  })
})

describe('Field', () => {
  it('ties the label to the input and the error to the field', () => {
    const html = renderToStaticMarkup(<Field label="Goal name" error="Taken">{(f) => <input {...f} className="input" />}</Field>)
    const id = /<label for="([^"]+)"/.exec(html)?.[1]
    expect(id).toBeTruthy()
    expect(html).toContain(`id="${id}"`)
    expect(html).toContain('aria-invalid="true"')
    expect(html).toMatch(/role="alert">Taken</)
    expect(html).toContain(`aria-describedby="${id}-err"`)
  })

  it('has no error line when there is none', () => {
    const html = renderToStaticMarkup(<Field label="Name">{(f) => <input {...f} />}</Field>)
    expect(html).not.toContain('role="alert"')
    expect(html).not.toContain('aria-invalid')
  })
})
