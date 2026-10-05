// Adding or changing a client report: one dialog (the page stays a plain list).
// A lazy chunk, loaded when the first one is opened.
import { FileText } from 'lucide-react'
import { DialogHead } from '../../components/DialogHead'
import { Modal } from '../../components/Modal'
import type { ReportSchedule } from '../../lib/apiMore'
import { copy } from './copy'
import { ReportForm, type Draft } from './ReportForm'
import './reportDialog.css'

export function ReportDialog({ site, from, langs, max, onDone }: { site: string; from: Draft; langs: string[]; max: number; onDone: (saved?: ReportSchedule) => void }) {
  const title = from.id ? copy.editTitle : copy.newTitle
  return (
    <Modal label={title} onClose={() => onDone()} className="rp-modal" keepSize={false}>
      <DialogHead icon={FileText} heading={title} />
      <ReportForm site={site} from={from} langs={langs} max={max} onDone={onDone} />
    </Modal>
  )
}
