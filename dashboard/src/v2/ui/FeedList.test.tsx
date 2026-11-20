import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Row } from '../../features/live/model'
import { FeedList } from './FeedList'

const NOW = 1_000_000
const row = (extra: Partial<Row>): Row => ({ kind: 'pageview', key: 'v:a', visitor: 'a', ts: NOW, last: NOW, path: '/', channel: 'Social', country: 'US', device: 'Mobile', os: 'iOS', ...extra })
const html = (r: Row) => renderToStaticMarkup(<FeedList rows={[r]} up={new Set()} clock={NOW} empty="" />)

describe('the Live list', () => {
  it('names a social app once: the source says Facebook, the device carries a badge and the title', () => {
    const out = html(row({ referrer: 'facebook.com', app: 'facebook' }))
    expect(out.replace(/<[^>]*>/g, ' ').match(/facebook/gi)).toEqual(['facebook'])
    expect(out).toContain('app-dot')
    expect(out).toContain('Mobile · Facebook')
  })

  it('badges a visit in an app, and never one in a browser', () => {
    expect(html(row({ app: 'app' }))).toContain('Mobile · iOS app')
    expect(html(row({ app: '' }))).not.toContain('app-dot')
  })
})
