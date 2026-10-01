// Over time: where visits came from, bucket by bucket, and beside it new
// against returning: one tab with two small ones (they were two tabs, and the
// second was a thin chart of the same days).
import { useId, useState } from 'react'
import { Tabs } from '../cards/Tabs'
import { deepCopy } from '../cards/deepCopy'
import type { Bucket } from '../../lib/api'
import { SourcesCard } from './cards/SourcesCard'
import { VisitorsCard } from './cards/VisitorsCard'
import type { Charts } from './api'

const TABS = [
  { id: 'sources', label: deepCopy.tab.sources },
  { id: 'returning', label: deepCopy.tab.returning },
]

export function OverTime({ charts, bucket, site }: { charts: Charts | null; bucket: Bucket; site: string }) {
  const [sub, setSub] = useState('sources')
  const prefix = useId().replace(/:/g, '') + site
  return (
    <>
      <Tabs prefix={prefix} label={deepCopy.tab.overTime} tabs={TABS} value={sub} onChange={setSub} sub />
      {sub === 'sources' ? <SourcesCard charts={charts} bucket={bucket} /> : <VisitorsCard charts={charts} bucket={bucket} />}
    </>
  )
}
