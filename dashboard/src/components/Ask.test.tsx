// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/permissions', () => ({ can: () => true }))
import { AskAbout } from './Ask'

const about = { title: 'Visitors', facts: ['1,204'], question: 'Why?' }
afterEach(() => document.documentElement.removeAttribute('data-ask-about'))

describe('the Ask about this mark on a card', () => {
  it('is not drawn until a listener says it is there', () => {
    expect(renderToStaticMarkup(<AskAbout about={about} />)).toBe('')
    document.documentElement.setAttribute('data-ask-about', '')
    const html = renderToStaticMarkup(<AskAbout about={about} />)
    expect(html).toContain('aria-label="Ask about this: Visitors"')
    expect(html).toContain('title="Ask about this"')
  })
})
