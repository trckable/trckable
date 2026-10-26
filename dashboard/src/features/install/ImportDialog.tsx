// "Import your history", on the first screen: what the importer reads today
// (GA4's BigQuery export, or a CSV of one row per pageview) and the command
// that runs it, with the docs one click away. Nothing here promises more than
// the importer does.
import { ExternalLink, FileSpreadsheet, History, Table2 } from 'lucide-react'
import { Copyable } from '../../components/Copyable'
import { Modal } from '../../kit/Modal'
import { ModalMark } from '../../kit/ModalMark'
import { first } from './firstCopy'
import { GoogleStep } from './GoogleStep'
import './firstActions.css'

const t = first.importDialog

export function ImportDialog({ domain, site, onClose }: { domain: string; site: string; onClose: () => void }) {
  return (
    <Modal
      label={t.title}
      onClose={onClose}
      keepSize={false}
      frame={{
        title: t.title,
        icon: <ModalMark icon={History} />,
        size: 'sm',
        cancel: false,
        extra: (
          <a className="btn ghost" href={t.docsUrl} target="_blank" rel="noreferrer">
            {t.docs}
            <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
          </a>
        ),
        actions: (
          <button type="button" className="btn primary big" onClick={onClose} autoFocus>
            {t.close}
          </button>
        ),
      }}
    >
      <div className="fa-import">
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
      </div>
    </Modal>
  )
}
