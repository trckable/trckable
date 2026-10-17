import { describe, expect, it } from 'vitest'
import { goalName } from './goalName'

describe('goalName', () => {
  it('keeps a label as written', () => expect(goalName('Bought the book', 'purchase')).toBe('Bought the book'))
  it('names the two events the script sends', () => {
    expect(goalName(undefined, 'outbound_click')).toBe('Outbound clicks')
    expect(goalName('', 'form_submit')).toBe('Form submissions')
  })
  it('puts any other snake or kebab name in sentence case', () => {
    expect(goalName(undefined, 'newsletter-signup')).toBe('Newsletter signup')
    expect(goalName(undefined, 'download_pdf')).toBe('Download pdf')
    expect(goalName(undefined, 'Signup')).toBe('Signup')
  })
})
