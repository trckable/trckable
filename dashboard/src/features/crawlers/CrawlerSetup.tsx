// "Connect crawler data": a three-step wizard, from where the site runs to the
// first robot arriving. Robots run no JavaScript, so the site's own server or CDN
// reports them to /api/crawl, sending only the robot's name, the page and the
// time. The code carries this site's id, key and server address.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { DialogActions } from '../../components/DialogActions'
import { DialogHead } from '../../components/DialogHead'
import { Modal } from '../../kit/Modal'
import { Stepper } from '../../components/Stepper'
import { fail, type Site, more } from '../../lib/apiMore'
import { addDays, todayIn } from '../../lib/dates'
import { fmtInt } from '../../lib/format'
import { copy } from './copy'
import { CrawlerCode } from './CrawlerCode'
import type { Setup } from './snippets'
import './CrawlerSetup.css'

const t = copy.setup
const TOTAL = 3

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
  const [step, setStep] = useState(1)
  const [setup, setSetup] = useState<Setup>('cloudflare')
  const [enabled, setEnabled] = useState(on)
  const [busy, setBusy] = useState(false)
  const [turned, setTurned] = useState(false)
  const arrived = useArrived(site, enabled)
  const plan = useMemo(() => ({ host: location.origin, site: site.id, key: site.proxy_key, domain: site.domain }), [site])
  const top = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  // A step that replaces the last one takes the focus with it, so a keyboard
  // user does not start again from the top of the page.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const h = top.current?.querySelector('h2')
    h?.setAttribute('tabindex', '-1')
    h?.focus()
  }, [step])
  const pick = (id: Setup) => {
    setSetup(id)
    setStep(2)
  }
  // The code is in place: switch crawler data on, then wait for the first robot.
  const turnOn = () => {
    if (enabled) {
      setStep(3)
      return
    }
    setBusy(true)
    more
      .setModule(site.id, 'crawlers', true)
      .then(() => {
        setEnabled(true)
        setTurned(true)
        setStep(3)
      })
      .catch((e: unknown) => fail(e, turnOn))
      .finally(() => setBusy(false))
  }
  const close = () => {
    if (turned || arrived > 0) onChanged()
    onClose()
  }
  const platform = t.options.find((o) => o.id === setup)?.label
  return (
    <Modal label={t.label} className="wide" onClose={close}>
      <div ref={top} className="cs-top">
        <Stepper step={step} total={TOTAL} label={t.step(step, TOTAL)} />
        <DialogHead heading={t.titles[step - 1]} hint={t.leads[step - 1]} help={t.help} />
      </div>
      <div className="cs-body" key={step}>
        {step === 1 && (
          <div className="cs-tiles" role="group" aria-label={t.titles[0]}>
            {t.options.map((o) => (
              <button key={o.id} type="button" className="cs-tile" onClick={() => pick(o.id)}>
                <b>{o.label}</b>
                <span className="faint">{o.sub}</span>
              </button>
            ))}
          </div>
        )}
        {step === 2 && <CrawlerCode setup={setup} plan={plan} />}
        {step === 3 && (
          <div className="cs-wait" role="status">
            {arrived > 0 ? (
              <span className="cs-ok">
                <Check size={28} strokeWidth={2.25} aria-hidden="true" />
              </span>
            ) : (
              <span className="cs-ring" aria-hidden="true" />
            )}
            <h3>{arrived > 0 ? t.connected : t.waiting}</h3>
            <p className="faint">{arrived > 0 ? t.arrived(fmtInt(arrived)) : t.waitHint}</p>
          </div>
        )}
      </div>
      <DialogActions
        left={
          step === 1 ? (
            <a className="btn ghost" href="https://docs.trckable.com/reports/ai-search/" target="_blank" rel="noreferrer">
              {t.docs}
            </a>
          ) : (
            <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
              {t.back}
            </button>
          )
        }
      >
        {step > 1 && <span className="cs-chip">{platform}</span>}
        {step === 2 && (
          <button type="button" className="btn primary big" disabled={busy} onClick={turnOn}>
            {t.next}
          </button>
        )}
        {step === 3 && (
          <button type="button" className="btn primary big" onClick={close}>
            {t.done}
          </button>
        )}
      </DialogActions>
    </Modal>
  )
}
