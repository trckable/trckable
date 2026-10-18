import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MailRow } from './MailRow'

const row = (on: boolean) => renderToStaticMarkup(<MailRow on={on} onPreview={() => {}} onManage={() => {}} onToggle={() => {}} />)

describe('the email line', () => {
  it('keeps its switch beside Preview, on or off', () => {
    expect(row(true)).toContain('Turn off')
    expect(row(false)).toContain('Turn on')
    expect(row(true)).toContain('data-mpv')
  })
  it('does not quote today\'s sentence as tomorrow\'s email', () => {
    expect(row(true)).toContain('08:00.')
    expect(row(true)).not.toContain('&quot;')
  })
})
