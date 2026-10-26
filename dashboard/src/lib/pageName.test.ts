import { describe, expect, it } from 'vitest'
import { PAGE_NAME_MAX, pageName } from './pageName'

describe('a page named in a sentence', () => {
  it('is Home for the root, with or without a query', () => {
    expect(pageName('/')).toBe('Home')
    expect(pageName('/?ref=x')).toBe('Home')
    expect(pageName('')).toBe('Home')
  })
  it('is the last segment, short paths as they are', () => {
    expect(pageName('/pricing')).toBe('/pricing')
    expect(pageName('/docs/install/')).toBe('/docs/install')
  })
  it('drops the query and the fragment', () => {
    expect(pageName('/blog/post?utm_source=x#top')).toBe('/blog/post')
  })
  it('cuts a long slug with an ellipsis, never longer than the limit', () => {
    const out = pageName('/news/pergatitja-e-dosjes-per-kualifikimin-e-mesuesve-20252026')
    expect([...out].length).toBeLessThanOrEqual(PAGE_NAME_MAX)
    expect(out.startsWith('…/pergatitja-e-dosjes-per-')).toBe(true)
    expect(out.endsWith('…')).toBe(true)
  })
  it('keeps unicode whole and decodes what it can', () => {
    expect(pageName('/%C3%AB/p%C3%ABrdorues')).toBe('/ë/përdorues')
    expect([...pageName('/a/' + 'ë'.repeat(50))]).toHaveLength(PAGE_NAME_MAX)
    expect(pageName('/100%')).toBe('/100%')
  })
})
