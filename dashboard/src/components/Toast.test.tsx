import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ToastHost from './ToastHost'

describe('ToastHost', () => {
  const html = renderToStaticMarkup(<ToastHost />)

  it('has both live regions from the start, so the first toast is announced', () => {
    expect(html).toContain('role="status"')
    expect(html).toContain('role="alert"')
  })

  it('draws nothing while there is nothing to say', () => {
    expect(html).not.toContain('class="toast ')
  })
})
