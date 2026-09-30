import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Columns } from './Columns'
import { RevenuePlot } from './RevenuePlot'
import { TimeDefs } from './TimeDefs'
import { PAD_L } from './plot'
import { Hero } from './TimeHero'

const x = (i: number) => PAD_L + i * 60
const axis = (n: number) => `$${n / 100}`
const plot = (values: number[], hover: number | null = null) =>
  renderToStaticMarkup(
    <svg>
      <TimeDefs id="g" w={400} h={300} base={200} padL={PAD_L} padT={8} tone="var(--accent)" />
      <RevenuePlot values={values} label="Revenue" none="No sales in this period" fmt={axis} axis={axis} id="g" x={x} w={400} top={200} hover={hover} partialLast dim={false} labelled />
    </svg>,
  )
const columns = (html: string) => (html.match(/class="money-col"/g) ?? []).length

describe('the revenue plot', () => {
  it('has its own labelled axis in the left margin: $0, half, top', () => {
    const html = plot([0, 14_900, 0, 0, 0])
    for (const label of ['$0', '$100', '$200']) expect(html).toContain(`>${label}</text>`)
  })
  it('draws a column for a day with sales and nothing for one without', () => {
    expect(columns(plot([0, 14_900, 0, 2_900, 0]))).toBe(2)
  })
  it('labels the biggest sale, and only it', () => {
    const html = plot([0, 14_900, 0, 2_900, 0])
    expect(html).toContain('>$149</text>')
    expect(html).not.toContain('>$29</text>')
  })
  it('handles a period with one sale: one column, one label', () => {
    const html = plot([0, 0, 14_900, 0])
    expect(columns(html)).toBe(1)
    expect(html).toContain('>$149</text>')
    expect(html).not.toContain('No sales in this period')
  })
  it('says once, quietly, that nothing sold, and labels only the baseline', () => {
    const html = plot([0, 0, 0, 0])
    expect(html).toContain('>No sales in this period</text>')
    expect(columns(html)).toBe(0)
    expect(html).toContain('>$0</text>')
    expect(html).not.toContain('>$100</text>')
  })
  it('stripes the day still counting', () => {
    expect(plot([0, 14_900, 0, 0, 500])).toContain('fill="url(#g-stripe)"')
  })
  it('lights the hovered day and softens the others', () => {
    const html = plot([14_900, 14_900, 14_900], 1)
    expect(html.match(/fill-opacity="0.62"/g)?.length).toBe(2)
  })
})

describe('columns', () => {
  it('draw nothing at all for no sales', () => {
    expect(renderToStaticMarkup(<svg><Columns values={[0, 0]} x={x} base={100} h={96} max={1} w={10} hover={null} fill="g" stripe="s" /></svg>)).not.toContain('<path')
  })
})

describe('a figure in the hover card', () => {
  it('says "No sales" on a day without, not a zero', () => {
    const html = renderToStaticMarkup(<Hero label="Revenue" color="var(--money)" big={null} />)
    expect(html).toContain('No sales')
    expect(html).not.toContain('ct-big')
  })
  it('writes its figure in the text colour beside a swatch in the money colour, with the sales under it', () => {
    const html = renderToStaticMarkup(<Hero label="Revenue" color="var(--money)" big="$149" note="1 sale" />)
    expect(html).toContain('background:var(--money)')
    expect(html).toContain('<span class="ct-big num">$149</span>')
    expect(html).toContain('1 sale')
  })
})
