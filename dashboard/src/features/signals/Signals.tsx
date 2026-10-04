// The live extras of a site's dashboard, in one chunk fetched once the stream
// has something to say: the count in the tab, the sale toast and chime, the
// browser notices and the card that offers them. Nothing here draws on the
// page itself (except the card): the Live layout is untouched.
import type { Sale, Site, Visit } from '../../lib/api'
import { NotifyAsk } from './NotifyAsk'
import SurgeCard from './SurgeCard'
import { useNotices } from './useNotices'
import { useSaleToast } from './useSaleToast'
import { useTabCount } from './useTabCount'

export interface SignalsProps {
  site: Site
  online: number | null
  visits: Visit[]
  sales: (Sale & { id: number })[]
  scope: string
  sources?: string[]
}

export default function Signals(p: SignalsProps) {
  useTabCount(p.online)
  useSaleToast(p.sales)
  useNotices(p)
  return (
    <>
      <NotifyAsk sold={p.sales.length > 0} />
      <SurgeCard site={p.site} />
    </>
  )
}
