import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Row } from '../explore/types'
import { XTable } from './XTable'

const row = (o: Partial<Row> = {}): Row => ({ val: 'DE', name: 'Germany', v: 40, c: 40, st: '', ...o })
const html = (rows: Row[]) => renderToStaticMarkup(<XTable rows={rows} head="Country" limit={5} of={100} onAll={() => {}} />)

describe('the Signups column', () => {
  it('shows when the rows carry signups, before Conversion, with a dash where nobody signed up', () => {
    const out = html([row({ su: 3 }), row({ val: 'US', name: 'United States', su: 0 })])
    expect(out).toContain('Signups')
    expect(out.indexOf('Signups')).toBeLessThan(out.indexOf('>Share<') + 1000)
    expect(out).toContain('>3<')
    expect(out).toContain('>–<')
  })
  it('is not there without a signup goal', () => {
    expect(html([row()])).not.toContain('Signups')
  })
  it('sits before Conversion when payments are connected', () => {
    const out = renderToStaticMarkup(<XTable rows={[row({ su: 3, rev: 100, cust: 1 })]} head="Country" limit={5} of={100} money={(n) => `$${n}`} onAll={() => {}} />)
    expect(out.indexOf('Signups')).toBeGreaterThan(-1)
    expect(out.indexOf('Signups')).toBeLessThan(out.indexOf('Conversion'))
  })
})
