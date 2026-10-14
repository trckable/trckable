// On the sites list: "Talked about" beside a site with a mention in the last 24 hours.
import { useNow } from '../incidents/useIncidents'
import { page } from './pageCopy'
import { FRESH } from './pageModel'
import { useMentions } from './useMentions'
import './page.css'

export default function TalkedChip({ site }: { site: string }) {
  const got = useMentions(site, '7d')
  const now = useNow()
  if (got.state !== 'ready' || !got.data.mentions.some((m) => now - m.posted_at < FRESH)) return null
  return <span className="mp-talked">{page.talked}</span>
}
