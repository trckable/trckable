import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MailRow } from './MailRow'

const row = (on: boolean) => renderToStaticMarkup(<MailRow on={on} onChange={() => {}} />)

describe('the email line', () => {
  it('is one quiet line with one Change, on or off', () => {
    expect(row(true)).toContain('Emailed daily at 08:00')
    expect(row(false)).toContain('The daily email is off')
    expect(row(true)).toContain('Change')
    expect(row(true)).toContain('data-mpv')
    expect(row(true).match(/<button/g)).toHaveLength(1)
  })
})
