// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { SamplePreview } from './SamplePreview'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('the sample preview', () => {
  it('is decoration: hidden from readers, labelled Sample data, with the site domain in the address bar', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const domain = 'a-very-long-subdomain.'.repeat(3) + 'example.com'
    act(() => root.render(<SamplePreview domain={domain} />))
    const frame = host.querySelector('[data-testid="sample-preview"]') as HTMLElement
    expect(frame.getAttribute('aria-hidden')).toBe('true')
    expect(frame.querySelector('.sp-chip')?.textContent).toBe('Sample data')
    expect(frame.querySelector('.sp-url')?.textContent).toBe(domain)
    act(() => root.unmount())
    host.remove()
  })

  it('keeps a long domain on one line with an ellipsis, inside the frame', () => {
    const css = readFileSync('src/features/install/samplePreview.css', 'utf8')
    const url = css.match(/\.sp-url \{[^}]*\}/)?.[0] ?? ''
    expect(url).toMatch(/min-width: 0/)
    expect(url).toMatch(/text-overflow: ellipsis/)
    expect(url).toMatch(/white-space: nowrap/)
  })
})
