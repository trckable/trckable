// Adding or changing a client report: one dialog (the page stays a plain list).
// A lazy chunk, loaded when the first one is opened.
import type { ReportSchedule } from '../../lib/apiMore'
import { copy } from './copy'
import { ReportForm, type Draft } from './ReportForm'
import './reportDialog.css'

export function ReportDialog({ site, from, langs, max, onDone }: { site: string; from: Draft; langs: string[]; max: number; onDone: (saved?: ReportSchedule) => void }) {
  return <ReportForm title={from.id ? copy.editTitle : copy.newTitle} site={site} from={from} langs={langs} max={max} onDone={onDone} />
}
