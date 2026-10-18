import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AllRow } from './AllRow'

const html = (total: number | null) => renderToStaticMarkup(<AllRow on={false} total={total} all="All sites" onPick={() => {}} />)

describe('the All sites row', () => {
  it('is only its name until the total is here, then adds it', () => {
    expect(html(null)).not.toContain('<b>')
    expect(html(42)).toContain('<b>42</b>')
  })
})
