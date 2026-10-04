// The privacy report as a sheet: what one site collects, read from its real
// settings, laid out to be read on screen and printed (or saved as a PDF)
// through the browser. Everything else on the page is hidden while printing.
import { Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DialogHead } from '../../components/DialogHead'
import { Modal } from '../../components/Modal'
import { Loading } from '../../components/loading/Loading'
import { tag } from '../../i18n'
import { api, more, type Site } from '../../lib/apiMore'
import { copy } from './copy'
import { buildReport, type Report } from './report'
import './ReportSheet.css'

const t = copy.sheet

function Part({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <section className="pr-part">
      <h3>{title}</h3>
      <ul>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </section>
  )
}

function Body({ r }: { r: Report }) {
  return (
    <>
      <section className="pr-part">
        <h3>{copy.part.settings}</h3>
        <dl className="pr-facts">
          {r.settings.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <Part title={copy.part.collected} items={r.collected} />
      <Part title={copy.part.notCollected} items={r.notCollected} />
      <Part title={copy.part.modules} items={r.modules} />
      <Part title={copy.part.where} items={[r.where]} />
      <section className="pr-part">
        <h3>{copy.part.banner}</h3>
        <p>{r.banner}</p>
        <p className="faint">{copy.banner.note}</p>
      </section>
      <section className="pr-part">
        <h3>{copy.part.policy}</h3>
        <pre className="pr-policy">{r.policy}</pre>
      </section>
    </>
  )
}

/** Print with the page behind hidden: a class on <body> for the length of the print dialog. */
function printSheet() {
  document.body.classList.add('pr-printing')
  window.addEventListener('afterprint', () => document.body.classList.remove('pr-printing'), { once: true })
  window.print()
}

export default function ReportSheet({ site, print, onClose }: { site: Site; print: boolean; onClose: () => void }) {
  const [r, setR] = useState<Report | 'failed' | null>(null)
  useEffect(() => {
    Promise.all([more.siteConfig(site.id), api.modules(site.id)])
      .then(([config, mods]) => setR(buildReport({ domain: site.domain, host: location.host, config, modules: Object.fromEntries(mods.modules.map((m) => [m.id, m.enabled])) })))
      .catch(() => setR('failed'))
  }, [site.id, site.domain])
  const ready = typeof r === 'object' && r !== null
  // Print straight away when it was asked for, once the facts are in.
  useEffect(() => {
    if (ready && print) setTimeout(printSheet, 50)
  }, [ready, print])

  return (
    <Modal label={t.title(site.domain)} className="pr-modal" onClose={onClose} keepSize={false}>
      <DialogHead heading={t.title(site.domain)} hint={t.made(new Date().toLocaleDateString(tag))} />
      {r === null && <Loading height={200} />}
      {r === 'failed' && <p className="muted">{t.failed}</p>}
      {ready && <Body r={r} />}
      <div className="pr-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t.close}
        </button>
        <button type="button" className="btn primary" disabled={!ready} onClick={printSheet}>
          <Printer size={15} strokeWidth={1.75} aria-hidden="true" /> {t.print}
        </button>
      </div>
    </Modal>
  )
}
