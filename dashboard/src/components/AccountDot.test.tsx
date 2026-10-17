import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AccountDot } from './AccountDot'

describe('the dot on the avatar', () => {
  it('is nothing without an alert', () => {
    expect(renderToStaticMarkup(<AccountDot />)).toBe('')
    expect(renderToStaticMarkup(<AccountDot alert={null} />)).toBe('')
  })
  it('says what it is for, in the tone it was given', () => {
    const html = renderToStaticMarkup(<AccountDot alert={{ label: 'Your plan is full', tone: 'bad' }} />)
    expect(html).toContain('acct-dot bad')
    expect(html).toContain('aria-label="Your plan is full"')
  })
})
