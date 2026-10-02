// Settings → Data & privacy: which visits are left out of the counts without
// the visitor having to do anything — robots in data centres, and your own.
import { Row } from '../components/Row'
import { Switch } from '../components/Switch'
import type { Site, SiteConfig } from '../lib/apiMore'

const words = {
  bots: {
    label: 'Stricter bot filtering',
    hint: 'Drops visits from data centres such as AWS or Hetzner (downloaded, then refreshed monthly, about 5 MB) and clients that name no browser. Private Relay and VPN users still count',
  },
  own: {
    label: 'Leave out my own visits',
    hint: 'Open the site once in each browser you use',
    free: 'Cookieless mode stores nothing in the browser, so there is nothing to remember',
    leave: 'Leave this browser out',
    again: 'Count it again',
  },
}

/** A link on the site itself: the tracker keeps the choice in that browser. */
const flag = (site: Site, what: 'ignore' | 'track') => `https://${site.domain}/?trckable=${what}`

export function Filtering({ site, c, save }: { site: Site; c: SiteConfig; save: (patch: Partial<SiteConfig>, said?: string) => void }) {
  const free = c.consent_free
  return (
    <>
      <Row label={words.bots.label} hint={words.bots.hint}>
        <Switch on={c.bot_strict} onChange={() => save({ bot_strict: !c.bot_strict })} />
      </Row>
      <Row label={words.own.label} hint={free ? words.own.free : words.own.hint}>
        {!free && (
          <>
            <a className="btn" href={flag(site, 'ignore')} target="_blank" rel="noreferrer">
              {words.own.leave}
            </a>
            <a className="btn" href={flag(site, 'track')} target="_blank" rel="noreferrer">
              {words.own.again}
            </a>
          </>
        )}
      </Row>
    </>
  )
}
