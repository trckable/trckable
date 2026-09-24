// What a shared link opens: the same dashboard, reading through the public
// endpoint, with everything that writes gone. It is a lazy chunk, so nobody
// signing in normally ever downloads it.
import { useState } from 'react'
import { Dashboard } from './Dashboard'
import { EmbedHeader, ShareHeader, SharePassword, ShareShell, isEmbed, useShare } from './Share'
import type { ShareInfo, Site } from '../lib/api'

/** The site, as far as a shared page needs to know it. There is no id to send
 *  anywhere — the cookie decides which site this is. */
const asSite = (info: ShareInfo): Site => ({
  id: 'shared',
  domain: info.domain,
  name: info.site || info.domain,
  timezone: info.timezone,
  currency: info.currency,
  proxy_key: '',
  last_event_at: Math.floor(Date.now() / 1000),
})

export default function SharedSite() {
  const s = useShare()
  const [opened, setOpened] = useState<ShareInfo | null>(null)
  const info = opened ?? (s.state === 'ready' ? s.info : null)

  if (info)
    return (
      <div className={isEmbed() ? 'app shared embed' : 'app shared'}>
        <Dashboard key={info.domain} site={asSite(info)} sites={[]} header={isEmbed() ? <EmbedHeader info={info} /> : <ShareHeader info={info} />} />
      </div>
    )
  if (s.state === 'password') return <SharePassword onOpen={setOpened} error={s.error} />
  if (s.state === 'error') return <ShareShell title="Nothing here" sub={s.message} />
  return <ShareShell title="Opening…" sub="One moment." />
}
