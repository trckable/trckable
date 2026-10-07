// "Import your history", on the first screen: what the importer reads today
// (GA4's BigQuery export, or a CSV of one row per pageview) and the command
// that runs it, with the docs one click away. Nothing here promises more than
// the importer does.
import { ExternalLink, FileSpreadsheet, History, Table2 } from 'lucide-react'
import { useRef } from 'react'
import { Copyable } from '../../components/Copyable'
import { DialogActions } from '../../components/DialogActions'
import { DialogHead } from '../../components/DialogHead'
import { Modal } from '../../kit/Modal'
import { first } from './firstCopy'
import { GoogleStep } from './GoogleStep'
import { useFocusTrap } from './useFocusTrap'
import '../../components/ConfirmDialog.css'
import './firstActions.css'

const t = first.importDialog

export function ImportDialog({ domain, site, onClose }: { domain: string; site: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useFocusTrap(box)
  return (
    <Modal label={t.title} className="confirm-modal" onClose={onClose} keepSize={false}>
      <div ref={box} className="confirm-body fa-import">
        <DialogHead icon={History} heading={t.title} />
        <ul className="fa-formats">
          <li>
            <span className="icon-tile small" aria-hidden="true">
              <Table2 size={14} strokeWidth={1.75} />
            </span>
            <b>{t.ga4}</b>
            <span className="faint">{t.ga4Sub}</span>
          </li>
          <li>
            <span className="icon-tile small" aria-hidden="true">
              <FileSpreadsheet size={14} strokeWidth={1.75} />
            </span>
            <b>{t.csv}</b>
            <span className="faint">{t.csvSub}</span>
          </li>
        </ul>
        <GoogleStep site={site} />
        <Copyable value={t.command(domain)} />
        <DialogActions
          left={
            <a className="btn ghost" href={t.docsUrl} target="_blank" rel="noreferrer">
              {t.docs}
              <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
            </a>
          }
        >
          <button type="button" className="btn primary big" onClick={onClose} autoFocus>
            {t.close}
          </button>
        </DialogActions>
      </div>
    </Modal>
  )
}
