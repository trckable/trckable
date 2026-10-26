import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MailRow } from './MailRow'
import { mailLabel, mailTime } from './mailLabel'

const row = (on: boolean) => renderToStaticMarkup(<MailRow on={on} onChange={() => {}} />)

describe('the email chip', () => {
  it('is one button, on or off, with the full sentence for the tooltip and screen readers', () => {
    expect(row(true)).toMatch(/Daily · 0?8:00/)
    expect(row(true)).toMatch(/aria-label="Emailed daily at 0?8:00[^"]*\. Change"/)
    expect(row(false)).toContain('Email me this')
    expect(row(false)).toContain('mailchip off')
    expect(row(true)).toContain('data-mpv')
    expect(row(true).match(/<button/g)).toHaveLength(1)
  })
})

describe('the email label', () => {
  it('writes the time the way the language does', () => {
    expect(mailTime(8, 'en-US')).toBe('8:00 AM')
    expect(mailTime(8, 'de')).toMatch(/^0?8:00$/)
    expect(mailTime(20, 'de')).toBe('20:00')
  })
  it('gives a short label and a full sentence for each state', () => {
    expect(mailLabel(true, 8, 'de').short).toMatch(/^Daily · 0?8:00$/)
    expect(mailLabel(false, 8, 'en-US').short).toBe('Email me this')
    expect(mailLabel(false, 8, 'en-US').full).toContain('off')
  })
})
