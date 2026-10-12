import { describe, expect, it } from 'vitest'
import { rowsOf } from './rows'

describe('the checks as lines', () => {
  it('fails the page alone when the site does not answer', () => {
    const rows = rowsOf({ url: 'https://a.example/', scripts: 0, error: 'a.example could not be reached over https' }, 'a.example')
    expect(rows).toEqual([{ id: 'page', label: 'Page answers', ok: false, text: 'a.example could not be reached over https' }])
  })

  it('passes all three when the tag is there and its script loads', () => {
    const rows = rowsOf({ url: 'https://a.example/', status: 200, ms: 180, found: 'site', via: 'page', scripts: 0, script: 'https://t.example/s.js', script_status: 200 }, 'a.example')
    expect(rows.map((r) => [r.id, r.ok])).toEqual([['page', true], ['tag', true], ['script', true]])
    expect(rows[0].text).toContain('200')
    expect(rows[0].text).toContain('180 ms')
  })

  it('says the tag is missing, with what to do', () => {
    const rows = rowsOf({ url: 'https://a.example/', status: 200, ms: 90, found: 'none', scripts: 3 }, 'a.example')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ id: 'tag', ok: false })
    expect(rows[1].text).toContain('No trckable script on a.example')
  })

  it('fails a script that does not load', () => {
    const rows = rowsOf({ url: 'https://a.example/', status: 200, ms: 90, found: 'site', via: 'page', scripts: 0, script: 'https://t.example/s.js', script_status: 404 }, 'a.example')
    expect(rows[2]).toMatchObject({ id: 'script', ok: false })
    expect(rows[2].text).toContain('404')
    expect(rowsOf({ url: 'u', status: 200, found: 'site', via: 'page', scripts: 0, script: 'https://t.example/s.js' }, 'a.example')[2].text).toContain('could not be loaded')
  })
})

describe('the one-sentence cause', () => {
  it('names the first failure, or says the visits are simply missing', async () => {
    const { causeOf } = await import('./rows')
    expect(causeOf(undefined, true)).toContain('did not answer')
    expect(causeOf(undefined, false)).toContain('Looking at the page')
    const bad = rowsOf({ url: 'https://a.example/', status: 200, ms: 9, found: 'none', scripts: 0 }, 'a.example')
    expect(causeOf(bad, false)).toContain('No trckable script')
    const good = rowsOf({ url: 'https://a.example/', status: 200, ms: 9, found: 'site', via: 'page', scripts: 0 }, 'a.example')
    expect(causeOf(good, false)).toContain('simply been no visits')
  })
})
