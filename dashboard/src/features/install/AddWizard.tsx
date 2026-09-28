// Adding a site: Your site → Install → Revenue (optional). The Install step is
// the same component a new site's dashboard shows, and it listens to the live
// stream, so the first visit turns it live here too.
import { Banknote, Globe } from 'lucide-react'
import { useState } from 'react'
import { DialogActions } from '../../components/DialogActions'
import { Name } from '../../components/Logo'
import { Modal } from '../../components/Modal'
import { SiteMark } from '../../components/SiteMark'
import { StepBody } from '../../components/StepBody'
import { Steps } from '../../components/Steps'
import { api, messageOf, type Site } from '../../lib/api'
import { openSettings } from '../../lib/settings'
import { navigate } from '../../lib/url'
import { useLive } from '../../lib/useLive'
import { wizard as t } from './copy'
import { Install } from './Install'
import './wizard.css'

// The wizard has no report to refresh: it only watches for the first visit.
const noRefetch = () => {}

function Title({ step, site, live }: { step: number; site: Site | null; live: boolean }) {
  if (step === 2 && live) return <>{t.titleLive}</>
  if (step === 2) return <>{t.addTo[0]} <Name /> {t.addTo[1]} {site?.domain}</>
  return <>{t.title[step - 1]}</>
}

function DomainStep({ domain, setDomain, clean, err, onSubmit }: { domain: string; setDomain: (d: string) => void; clean: string; err: string | null; onSubmit: () => void }) {
  return (
    <form
      id="wiz-domain"
      className="wiz-domain"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <label className="wiz-field">
        <span className="wiz-prefix" aria-hidden="true">
          {t.prefix}
        </span>
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={t.placeholder} aria-label={t.domain} autoFocus required spellCheck={false} autoCapitalize="none" />
        {clean && <SiteMark site={{ domain: clean }} size={28} />}
      </label>
      <span className="faint wiz-help">{t.domainHelp}</span>
      {err && (
        <p className="confirm-err" role="alert">
          {err}
        </p>
      )}
    </form>
  )
}

export function AddWizard({ onClose, onSites }: { onClose: () => void; onSites: () => void }) {
  const [step, setStep] = useState(1)
  const [domain, setDomain] = useState('')
  const [site, setSite] = useState<Site | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const stream = useLive(site?.id ?? null, noRefetch)
  const live = stream.visits.length > 0

  const create = () => {
    setBusy(true)
    setErr(null)
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    api
      .createSite(domain.trim())
      .then((s) => api.updateSite(s.id, { timezone: zone }).catch(() => s))
      .then((s) => {
        setSite(s)
        onSites()
        setStep(2)
      })
      .catch((e: unknown) => setErr(messageOf(e)))
      .finally(() => setBusy(false))
  }
  const clean = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const open = () => {
    if (!site) return
    onClose()
    navigate('/' + encodeURIComponent(site.domain))
  }
  const payments = () => {
    if (!site) return
    onClose()
    openSettings(site, 'payments')
  }

  return (
    <Modal label={t.label} className="wizard add-site" onClose={onClose}>
      <div className="wiz-head">
        <span className="modal-badge" aria-hidden="true">
          {step === 3 ? <Banknote size={19} strokeWidth={1.75} /> : <Globe size={19} strokeWidth={1.75} />}
        </span>
        <div>
          <h2>
            <Title step={step} site={site} live={live} />
          </h2>
          <span className="faint">{t.sub[step - 1]}</span>
        </div>
      </div>
      <Steps labels={t.steps} at={step - 1} done={live && step === 2 ? 1 : undefined} />

      <StepBody step={step} className="wiz-step">
        {step === 1 && <DomainStep domain={domain} setDomain={setDomain} clean={clean} err={err} onSubmit={create} />}
        {step === 2 && site && <Install site={site} visits={stream.visits} variant="wizard" />}
        {step === 3 && <p className="muted wiz-revenue">{t.revenueBody}</p>}
      </StepBody>

      {step === 1 && (
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={onClose}>
              {t.cancel}
            </button>
          }
        >
          <button type="submit" form="wiz-domain" className="btn primary big" disabled={busy || !clean}>
            {busy && <span className="btn-spin" aria-hidden="true" />}
            {busy ? t.adding : t.add}
          </button>
        </DialogActions>
      )}
      {step === 2 && (
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={open}>
              {t.later}
            </button>
          }
        >
          <button type="button" className={live ? 'btn primary big' : 'btn big'} onClick={() => setStep(3)}>
            {t.next}
          </button>
        </DialogActions>
      )}
      {step === 3 && (
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={() => setStep(2)}>
              {t.back}
            </button>
          }
        >
          <button type="button" className="btn big" onClick={open}>
            {t.revenueSkip}
          </button>
          <button type="button" className="btn primary big" onClick={payments}>
            {t.revenueConnect}
          </button>
        </DialogActions>
      )}
    </Modal>
  )
}
