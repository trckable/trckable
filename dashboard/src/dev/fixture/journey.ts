// One visitor's journey for the visitor dialog: a visit in Instagram's browser, one in the phone's own, one in another app's web view. Dev only.
import type { JourneyResult, JourneyVisit } from '../../lib/api'

const MIN = 60000
const ev = (at: number, path: string, engaged_s: number) => ({ at: new Date(at).toISOString(), kind: 'pageview', path, engaged_s })

export function journeyOf(visitor: string, now: number): JourneyResult {
  const visit = (agoMin: number, lenMin: number, extra: Partial<JourneyVisit>, paths: string[]): JourneyVisit => {
    const start = now - agoMin * MIN
    return {
      start: new Date(start).toISOString(),
      end: new Date(start + lenMin * MIN).toISOString(),
      channel: 'Social',
      country: 'DE',
      device: 'Mobile',
      os: 'iOS',
      pageviews: paths.length,
      engaged_s: lenMin * 40,
      events: paths.map((p, i) => ev(start + i * MIN, p, 30)),
      ...extra,
    }
  }
  // ?journey=long: a nine-page visit with a very long path, and five visits in all.
  if (new URLSearchParams(location.search).get('journey') === 'long') {
    const pages = ['/', '/pricing', '/docs/getting-started', '/docs/install', '/blog', '/blog/2026/11/how-we-rebuilt-our-onboarding-flow-for-small-teams-part-two-with-a-very-long-title-that-never-ends', '/changelog', '/pricing', '/signup']
    return {
      journey: {
        visitor,
        first_seen: new Date(now - 9 * 86400000).toISOString(),
        visits: [
          visit(4, 9, { browser: 'Safari', app: 'instagram', referrer: 'instagram.com' }, pages),
          visit(1500, 5, { browser: 'Safari', channel: 'Direct' }, ['/', '/blog']),
          visit(4300, 2, { browser: 'Chrome', os: 'Android', app: 'app', channel: 'Email' }, ['/pricing']),
          visit(9000, 3, { browser: 'Safari', channel: 'Direct' }, ['/', '/docs']),
          visit(12000, 2, { browser: 'Safari', channel: 'Search', referrer: 'google.com' }, ['/blog']),
        ],
      },
      currency: 'USD',
    }
  }
  return {
    journey: {
      visitor,
      first_seen: new Date(now - 3 * 86400000).toISOString(),
      visits: [
        visit(4, 3, { browser: 'Safari', app: 'instagram', referrer: 'instagram.com' }, ['/', '/pricing']),
        visit(1500, 5, { browser: 'Safari', channel: 'Direct' }, ['/', '/blog']),
        visit(4300, 2, { browser: 'Chrome', os: 'Android', app: 'app', channel: 'Email' }, ['/pricing']),
      ],
    },
    currency: 'USD',
  }
}
