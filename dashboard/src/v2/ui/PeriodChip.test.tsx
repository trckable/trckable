import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PillNote } from './pillNote'
import { PeriodChip, type PeriodChipProps } from './PeriodChip'

const base: PeriodChipProps = {
  label: 'Tue 13 Oct', options: [], more: [], value: 'custom', compare: 'none', yearOk: false, today: '2026-10-17',
  customRange: { from: '2026-10-13', to: '2026-10-13' }, onPick: () => {}, onCompare: () => {}, onRange: () => {}, grain: () => 'by hour',
}

describe('the period chip', () => {
  it('has a way back to today while the page is on another period', () => {
    const html = renderToStaticMarkup(<PeriodChip {...base} onReset={() => {}} />)
    expect(html).toContain('class="pill-x"')
    expect(html).toContain('aria-label="Back to today"')
    expect(html).toContain('pwrap set')
  })

  it('has none on today', () => {
    expect(renderToStaticMarkup(<PeriodChip {...base} value="today" />)).not.toContain('pill-x')
  })

  it('carries a note as a second line inside the button', () => {
    const html = renderToStaticMarkup(<PillNote.Provider value="Updated 15:35"><PeriodChip {...base} /></PillNote.Provider>)
    expect(html).toMatch(/<button[^>]*id="perBtn"[\s\S]*pl-note">Updated 15:35<\/span>[\s\S]*<\/button>/)
  })
})
