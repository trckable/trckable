// "Connect crawler data": three steps, from where the site runs to the first
// robot arriving. Robots run no JavaScript, so the site's own server or CDN
// reports them to /api/crawl, sending only the robot's name, the page and the
// time. The code carries this site's id, key and server address.
import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { CodeBlock } from '../../components/Code'
import { Copyable } from '../../components/Copyable'
import { DialogActions } from '../../components/DialogActions'
import { DialogHead } from '../../components/DialogHead'
import { Modal } from '../../kit/Modal'
import { fail, type Site, more } from '../../lib/apiMore'
import { addDays, todayIn } from '../../lib/dates'
import { fmtInt } from '../../lib/format'
import { Tabs } from '../cards/Tabs'
import { copy } from './copy'
import { snippetsFor, type Setup } from './snippets'
import './CrawlerSetup.css'

const t = copy.setup
const KEY_IN_ENV: Setup[] = ['cloudflare', 'vercel']

/** Robots reported in the last two days, once something is switched on: it polls while the sheet is open. */
function useArrived(site: Site, on: boolean): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!on || n > 0) return
    const ask = () => {
      const today = todayIn(site.timezone)
      more
        .aiSearch(site.id, { from: addDays(today, -1), to: today }, 1)
        .then((r) => setN(r.crawled))
        .catch(() => undefined)
    }
    ask()
    const id = setInterval(ask, 6000)
    return () => clearInterval(id)
  }, [site.id, site.timezone, on, n])
  return n
}

export function CrawlerSetup({ site, on, onChanged, onClose }: { site: Site; on: boolean; onChanged: () => void; onClose: () => void }) {
  const [setup, setSetup] = useState<Setup>('cloudflare')
  const [enabled, setEnabled] = useState(on)
  const [busy, setBusy] = useState(false)
  const [turned, setTurned] = useState(false)
  const arrived = useArrived(site, enabled)
  const plan = useMemo(() => ({ host: location.origin, site: site.id, key: site.proxy_key, domain: site.domain }), [site])
  const turnOn = () => {
    setBusy(true)
    more
      .setModule(site.id, 'crawlers', true)
      .then(() => {
        setEnabled(true)
        setTurned(true)
      })
      .catch((e: unknown) => fail(e, turnOn))
      .finally(() => setBusy(false))
  }
  const close = () => {
    if (turned || arrived > 0) onChanged()
    onClose()
  }
  return (
    <Modal label={t.label} className="wide" onClose={close}>
      <DialogHead heading={t.title} hint={t.hint} help={t.help} />
      <ol className="cs-steps">
        <li>
          <b>{t.steps[0]}</b>
          <Tabs prefix={'cs-' + site.id} label={t.steps[0]} tabs={[...t.options]} value={setup} onChange={(id) => setSetup(id as Setup)} sub />
        </li>
        <li>
          <b>{t.steps[1]}</b>
          {snippetsFor(setup, plan).map((s) => (
            <div key={s.id} className="cs-snippet">
              <span className="faint cs-caption">{t.captions[s.id]}</span>
              <CodeBlock lang={s.lang} code={s.code} />
            </div>
          ))}
          {KEY_IN_ENV.includes(setup) && (
            <div className="cs-key">
              <span className="faint">{t.keyHint}</span>
              <Copyable value={site.proxy_key} secret />
            </div>
          )}
        </li>
        <li>
          <b>{t.steps[2]}</b>
          {!enabled && (
            <button type="button" className="btn primary cs-on" disabled={busy} onClick={turnOn}>
              {t.on}
            </button>
          )}
          {enabled && (
            <span className={'cs-status' + (arrived > 0 ? ' done' : '')} role="status">
              {arrived > 0 ? <Check size={14} strokeWidth={2.25} aria-hidden="true" /> : <span className="btn-spin" aria-hidden="true" />}
              {arrived > 0 ? t.arrived(fmtInt(arrived)) : t.waiting}
            </span>
          )}
        </li>
      </ol>
      <DialogActions
        left={
          <a className="btn ghost" href="https://docs.trckable.com/reports/ai-search/" target="_blank" rel="noreferrer">
            {t.docs}
          </a>
        }
      >
        <button type="button" className="btn primary big" onClick={close}>
          {t.done}
        </button>
      </DialogActions>
    </Modal>
  )
}
