// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { openPeek, peekAction } from '../openPeek'
import { Logo } from './Header'

describe('the header’s logo', () => {
  it('is the brand’s ghost, not a drawing of its own', () => {
    const html = renderToStaticMarkup(<Logo title="All sites" onClick={() => {}} />)
    expect(html).toContain('tkb-logo')
    expect(html).toContain('tkb-ghost')
    expect(html).toContain('tkb-body')
    expect(html).toContain('aria-label="All sites"')
  })
})

describe('the ghost', () => {
  it('opens Peek: a click and Enter call what the header gives it', () => {
    const calls: string[] = []
    const el = Logo({ title: 'Ask Peek', onClick: () => calls.push('open') }) as { props: { onClick: () => void; onKeyDown: (e: { key: string }) => void } }
    el.props.onClick()
    el.props.onKeyDown({ key: 'Enter' })
    el.props.onKeyDown({ key: 'a' })
    expect(calls).toEqual(['open', 'open'])
  })

  it('openPeek says the one event Peek listens for', () => {
    let heard = 0
    const on = () => heard++
    window.addEventListener('trckable:ask', on)
    openPeek()
    window.removeEventListener('trckable:ask', on)
    expect(heard).toBe(1)
  })

  it('asks for Peek only where the build provides one', () => {
    const own = () => {}
    expect(peekAction(undefined, undefined)).toBeUndefined()
    expect(peekAction(undefined, () => {})).toBe(openPeek)
    expect(peekAction(own, undefined)).toBe(own)
  })
})
