import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SavedFlag } from './SavedFlag'

describe('the Saved flag', () => {
  it('says nothing before a save, and Saved after one', () => {
    expect(renderToStaticMarkup(<SavedFlag on={false} />)).not.toContain('Saved')
    expect(renderToStaticMarkup(<SavedFlag on />)).toContain('>Saved<')
  })
})
