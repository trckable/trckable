// The chart over Overview: the one What changed draws, with its mentions chip, its notes button and the site's usual
// band, for the page's own site, period and filters (a cut of the site is told against the period before alone).
import { useState } from 'react'
import { useNotes } from '../../../features/notes/useNotes'
import type { Report } from '../../../lib/api'
import { NotesSheet } from '../../ui/BriefingSheets'
import type { XCtx } from '../ctx'
import ChangedChart from './ChangedChart'

export default function OverviewChart({ x, report }: { x: XCtx; report: Report }) {
  const notes = useNotes(x.site.id, { from: x.query.from, to: x.query.to }, () => undefined)
  const [sheet, setSheet] = useState(false)
  return (
    <>
      <ChangedChart x={x} report={report} notes={notes.notes} onNotes={() => setSheet(true)} />
      {sheet && <NotesSheet site={x.site.domain} siteId={x.site.id} notes={notes.notes} onChanged={notes.load} onClose={() => setSheet(false)} />}
    </>
  )
}
