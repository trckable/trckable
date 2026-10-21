// @vitest-environment happy-dom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { V2ExtrasContext } from '../slots'

const allowed = vi.hoisted(() => ({ settings: true }))
vi.mock('../../lib/permissions', () => ({ can: () => allowed.settings }))
import { EmptyBlock } from './EmptyBlock'

const site = { id: 's1', domain: 'a.test' } as Site
const action = { label: 'Turn on speed', setup: 'speed' as const, ask: 'What does Speed & uptime do, and should I turn it on?' }
const draw = (askPeekNow?: (q: string) => void) =>
  renderToStaticMarkup(createElement(V2ExtrasContext.Provider, { value: { askPeekNow } }, createElement(EmptyBlock, { site, line: 'No speed data yet', ghost: ['gauge'], action })))

describe('Why? beside the setup action', () => {
  it('sits next to the button, never in its place', () => {
    allowed.settings = true
    const html = draw(() => undefined)
    expect(html).toContain('Turn on speed')
    expect(html).toContain('Why?')
  })
  it('is not drawn where there is no Peek, so the public product has no dead link', () => {
    allowed.settings = true
    expect(draw()).not.toContain('Why?')
  })
  it('is all a viewer sees of the action', () => {
    allowed.settings = false
    const html = draw(() => undefined)
    expect(html).not.toContain('Turn on speed')
    expect(html).toContain('Why?')
  })
})
