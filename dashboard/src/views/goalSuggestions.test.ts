import { describe, expect, it } from 'vitest'
import { goalSuggestions } from './goalSuggestions'

const one = (p: string) => goalSuggestions([p], [])

describe('goal suggestions', () => {
  it('knows every first segment', () => {
    const cases: [string, string][] = [
      ['/thanks', 'Reached thank-you page'],
      ['/thank-you', 'Reached thank-you page'],
      ['/thankyou', 'Reached thank-you page'],
      ['/success', 'Reached confirmation page'],
      ['/confirmed', 'Reached confirmation page'],
      ['/confirmation', 'Reached confirmation page'],
      ['/order-confirmation', 'Reached confirmation page'],
      ['/welcome', 'Reached welcome page'],
      ['/signup', 'Opened sign up'],
      ['/sign-up', 'Opened sign up'],
      ['/register', 'Opened sign up'],
      ['/join', 'Opened sign up'],
      ['/pricing', 'Opened pricing'],
      ['/plans', 'Opened pricing'],
      ['/contact', 'Opened contact'],
    ]
    for (const [path, name] of cases) expect(one(path)).toEqual([{ name, path }])
  })

  it('matches case-insensitively and keeps the path as recorded', () => {
    expect(one('/Pricing')).toEqual([{ name: 'Opened pricing', path: '/Pricing' }])
  })

  it('uses a wildcard for deeper paths, alone or with the exact one', () => {
    expect(one('/thanks/abc')).toEqual([{ name: 'Reached thank-you page', path: '/thanks/*' }])
    expect(goalSuggestions(['/thanks', '/thanks/abc'], [])).toEqual([{ name: 'Reached thank-you page', path: '/thanks/*' }])
  })

  it('does not match longer words, locales or other pages', () => {
    expect(goalSuggestions(['/thanksgiving', '/en/pricing', '/blog/pricing', '/', '/about', 'pricing'], [])).toEqual([])
  })

  it('offers one suggestion per name', () => {
    expect(goalSuggestions(['/thanks', '/thank-you'], [])).toEqual([{ name: 'Reached thank-you page', path: '/thanks' }])
  })

  it('orders the Reached group first and stops at four', () => {
    const pages = ['/contact', '/pricing', '/signup', '/welcome', '/success', '/thanks']
    expect(goalSuggestions(pages, []).map((s) => s.name)).toEqual(['Reached thank-you page', 'Reached confirmation page', 'Reached welcome page', 'Opened sign up'])
  })

  it('skips what an existing goal already has, by name or path', () => {
    const pages = ['/pricing', '/contact', '/signup']
    expect(goalSuggestions(pages, [{ name: 'Opened pricing', path: '/x' }]).map((s) => s.name)).toEqual(['Opened sign up', 'Opened contact'])
    expect(goalSuggestions(pages, [{ name: 'Mine', path: '/contact' }]).map((s) => s.name)).toEqual(['Opened sign up', 'Opened pricing'])
  })

  it('has nothing for no pages', () => {
    expect(goalSuggestions([], [])).toEqual([])
  })
})
