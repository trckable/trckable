import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BLANK, ReportForm, summaryOf } from './ReportForm'

const draw = (from = BLANK) => renderToStaticMarkup(<ReportForm site="s" from={from} langs={['en', 'de', 'fr', 'es', 'it', 'nl']} max={10} onDone={() => undefined} />)

describe('the report form', () => {
  it('offers both rhythms, all six languages, the PDF switch and the addresses', () => {
    const html = draw()
    expect(html).toContain('Weekly')
    expect(html).toContain('Monthly')
    for (const name of ['English', 'Deutsch', 'Français', 'Español', 'Italiano', 'Nederlands']) expect(html).toContain(name)
    expect(html).toContain('aria-pressed="true"') // weekly, to begin with
    expect(html).toContain('Attach a PDF')
    expect(html).toContain('One per line, up to 10')
  })
  it('starts from the schedule being changed, with a summary of it', () => {
    const html = draw({ id: 'rep_1', name: 'Acme GmbH', cadence: 'monthly', lang: 'de', pdf: false, recipients: ['a@example.com', 'b@example.com'], enabled: true })
    expect(html).toContain('value="Acme GmbH"')
    expect(html).toContain('a@example.com\nb@example.com')
    expect(html).toContain('<option value="de" selected="">Deutsch</option>')
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain('Monthly · Deutsch · 2 addresses')
  })
  it('writes the summary from the draft', () => {
    expect(summaryOf(BLANK, 0)).toBe('Weekly · English · PDF · No addresses')
    expect(summaryOf({ ...BLANK, cadence: 'monthly', pdf: false }, 1)).toBe('Monthly · English · 1 address')
  })
})
