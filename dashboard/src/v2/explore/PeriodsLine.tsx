// When the numbers were read, and the one warning a comparison can need. The two periods themselves are on the period chip.
import { useEffect, useState } from 'react'
import { reportReadAt, type Site } from '../../lib/api'
import { todayIn, type Range } from '../../lib/dates'
import type { ViewState } from '../../lib/url'
import { dateFmt } from '../../lib/format'
import { copy } from './copy'
import { periodsOf } from './periods'

const clock = (at: Date, timeZone: string) => dateFmt(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(at)

export function Updated({ site, read }: { site: Site; read: unknown }) {
  const [at, setAt] = useState(() => new Date())
  useEffect(() => {
    if (read) setAt(new Date(reportReadAt() || Date.now()))
  }, [read])
  return <span className="xupdated">{copy.updated(clock(at, site.timezone))}</span>
}

export function PeriodNote({ site, view, range, compares }: { site: Site; view: ViewState; range: Range; compares: boolean }) {
  const note = compares ? periodsOf(view, range, todayIn(site.timezone), '').note : undefined
  return note ? <p className="xperiod-note">{note}</p> : null
}
