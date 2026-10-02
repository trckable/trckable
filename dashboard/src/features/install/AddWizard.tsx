// Adding a site: Your site → Install → Revenue (optional). The Install step is
// the same component a new site's dashboard shows, and it listens to the live
// stream, so the first visit turns it live here too.
import { Banknote, Globe } from 'lucide-react'
import { useState } from 'react'
import { DialogActions } from '../../components/DialogActions'
import { DialogHead } from '../../components/DialogHead'
import { Name } from '../../components/Logo'
import { Modal } from '../../components/Modal'
import { StepBody } from '../../components/StepBody'
import { Steps } from '../../components/Steps'
import { fail, type Site, more } from '../../lib/apiMore'
import { openSettings } from '../../lib/settings'
import { navigate } from '../../lib/url'
import { useLive } from '../../lib/useLive'
import { wizard as t } from './copy'
import { checkDomain, cleanDomain, isAdded } from './domain'
import { DomainStep, type Verdict } from './DomainStep'
import { Install } from './Install'
import './wizard.css'

// The wizard has no report to refresh: it only watches for the first visit.
const noRefetch = () => {}

function Title({ step, site, live }: { step: number; site: Site | null; live: boolean }) {
  if (step === 2 && live) return <>{t.titleLive}</>
  if (step === 2) return <>{t.addTo[0]} <Name /> {t.addTo[1]} {site?.domain}</>
  return <>{t.title[step - 1]}</>
}

export function AddWizard({ onClose, onSites, sites = [] }: { onClose: () => void; onSites: () => void; sites?: Site[] }) {
  const [step, setStep] = useState(1)
  const [domain, setDomain] = useState('')
  const [site, setSite] = useState<Site | null>(null)
  const [busy, setBusy] = useState(false)
  const stream = useLive(site?.id ?? null, noRefetch)
  const live = stream.visits.length > 0

  const clean = site ? site.domain : cleanDomain(domain)
  const checked = checkDomain(clean, site ? clean : domain)
  const verdict: Verdict = checked === 'ok' && !site && isAdded(clean, sites.map((x) => x.domain)) ? 'added' : checked
  const valid = verdict === 'ok' || site !== null
  const reason = verdict === 'ok' || site ? '' : t.needs[verdict]
  const create = () => {
    if (site) {
      setStep(2)
      return
    }
    setBusy(true)
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    more
      .createSite(clean)
      .then((s) => more.updateSite(s.id, { timezone: zone }).catch(() => s))
      .then((s) => {
        setSite(s)
        onSites()
        setStep(2)
      })
      .catch((e: unknown) => fail(e, create))
      .finally(() => setBusy(false))
  }
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
    <Modal label={t.label} className="wizard add-site" onClose={onClose} keepSize={false}>
      <DialogHead icon={step === 3 ? Banknote : Globe} heading={<Title step={step} site={site} live={live} />} hint={t.sub[step - 1]} />
      <Steps labels={t.steps} at={step - 1} done={live && step === 2 ? 1 : undefined} onGo={(i) => setStep(i + 1)} />

      <StepBody step={step} className="wiz-step" fit>
        {step === 1 && <DomainStep domain={site ? site.domain : domain} setDomain={setDomain} clean={clean} verdict={verdict} locked={site !== null} onSubmit={create} />}
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
          <button type="submit" form="wiz-domain" className="btn primary big" disabled={busy || !valid} title={reason || undefined} aria-describedby={reason ? 'wiz-status' : undefined}>
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
          <button type="button" className="btn ghost" onClick={open}>
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
