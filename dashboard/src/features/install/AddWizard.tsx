// Adding a site: Your site → Kind → Install → Revenue (optional). The Install step is
// the same component a new site's dashboard shows, and it listens to the live
// stream, so the first visit turns it live here too.
import { ArrowRight, Banknote, Globe } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Name } from '../../components/Logo'
import { Modal, type Frame } from '../../kit/Modal'
import { ModalMark } from '../../kit/ModalMark'
import { StepBody } from '../../components/StepBody'
import { Steps } from '../../components/Steps'
import { type Site, type SiteKind, more } from '../../lib/apiMore'
import { formWords } from '../../lib/formWords'
import type { SitePrefill } from '../../lib/addSiteLink'
import { openSettings } from '../../lib/settings'
import { navigate } from '../../lib/url'
import { useLive } from '../../lib/useLive'
import { wizard as t } from './copy'
import { checkDomain, cleanDomain, isAdded } from './domain'
import { DomainStep, type Verdict } from './DomainStep'
import { Install } from './Install'
import { guessOf } from './kind'
import { KindStep } from './KindStep'
import { useInstallCheck } from './useInstallCheck'
import './wizard.css'
import { browserZone } from '../../lib/format'

// The wizard has no report to refresh: it only watches for the first visit.
const noRefetch = () => {}

const headIcon = (step: number) => {
  if (step === 3) return undefined
  return step === 4 ? Banknote : Globe
}

/** The one button of the Install step: it checks, then goes on to Revenue. */
function labelOf({ checking, passed, settled }: { checking: boolean; passed: boolean; settled: boolean }): string {
  if (checking) return t.checkingBtn
  if (passed) return t.continue
  return settled ? t.anyway : t.installed
}

function Title({ step, site, live }: { step: number; site: Site | null; live: boolean }) {
  if (step === 3 && live) return <>{t.titleLive}</>
  if (step === 3) return <>{t.addTo[0]} <Name /> {t.addTo[1]} {site?.domain}</>
  return <>{t.title[step - 1]}</>
}

export function AddWizard({ onClose, onSites, sites = [], prefill = null }: { onClose: () => void; onSites: () => void; sites?: Site[]; prefill?: SitePrefill | null }) {
  const [step, setStep] = useState(1)
  const [domain, setDomain] = useState(prefill?.domain ?? '')
  const next = useRef<HTMLButtonElement>(null)
  // A domain that came with the link is already there: the one thing left is Continue.
  useEffect(() => {
    if (prefill) next.current?.focus()
  }, [prefill])
  const [site, setSite] = useState<Site | null>(null)
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState('')
  const [kind, setKind] = useState<SiteKind | null>(null)
  const [guess, setGuess] = useState<SiteKind | null>(null)
  const [reading, setReading] = useState(false)
  const stream = useLive(site?.id ?? null, noRefetch)
  const live = stream.visits.length > 0
  // "I've installed it" runs the check, and goes on to Revenue once the script is found (or a visit came).
  const check = useInstallCheck(site?.id ?? '', live)
  const [going, setGoing] = useState(false)
  const found = check.state.phase === 'done' && check.state.result.found === 'site'
  const passed = live || found
  const checking = check.state.phase === 'checking'
  const settled = check.state.phase !== 'idle' && !checking
  // Once the check passes the way is open; if it does not, the button offers to go on anyway.
  if (going && passed && step === 3) setStep(4)
  if (going && settled && !passed) setGoing(false)

  const clean = site ? site.domain : cleanDomain(domain)
  const checked = checkDomain(clean, site ? clean : domain)
  const verdict: Verdict = checked === 'ok' && !site && isAdded(clean, sites.map((x) => x.domain)) ? 'added' : checked
  const valid = verdict === 'ok' || site !== null
  const reason = verdict === 'ok' || site ? '' : t.needs[verdict]
  // The homepage read suggests the kind; nothing found leaves the chips unchosen.
  const readKind = (id: string) => {
    setReading(true)
    more
      .checkInstall(id)
      .then((c) => {
        const g = guessOf(c)
        setGuess(g)
        setKind((k) => k ?? g)
      })
      .catch(() => undefined)
      .finally(() => setReading(false))
  }
  const keepKind = () => {
    if (!site || !kind) {
      setStep(3)
      return
    }
    more.setupKind(site.id, kind).catch(() => undefined).finally(() => setStep(3))
  }
  const create = () => {
    if (site) {
      setStep(2)
      return
    }
    setBusy(true)
    setRefusal('')
    const zone = browserZone()
    more
      .createSite(clean)
      .then((s) => more.updateSite(s.id, { timezone: zone }).catch(() => s))
      .then((s) => {
        setSite(s)
        onSites()
        setStep(2)
        readKind(s.id)
      })
      .catch((e: unknown) => setRefusal(formWords(e, { 500: t.failed, 502: t.failed, 503: t.failed, 504: t.failed })))
      .finally(() => setBusy(false))
  }
  const open = () => {
    if (!site) return
    onClose()
    navigate('/' + encodeURIComponent(site.domain))
  }
  const installed = () => {
    if (passed || settled) {
      setStep(4)
      return
    }
    setGoing(true)
    check.start()
  }
  const installLabel = labelOf({ checking, passed, settled })
  const payments = () => {
    if (!site) return
    onClose()
    openSettings(site, 'payments')
  }

  const foot = (): Pick<Frame, 'cancel' | 'extra' | 'actions'> => {
    if (step === 1) return {
          cancel: t.cancel,
          actions: (
            <button ref={next} type="submit" form="wiz-domain" className="btn primary big" disabled={busy || !valid} title={reason || undefined} aria-describedby={reason ? 'wiz-status' : undefined}>
              {busy && <span className="btn-spin" aria-hidden="true" />}
              {busy ? t.adding : t.add}
            </button>
          ),
        }
    if (step === 2) return {
            cancel: false,
            extra: (
              <button type="button" className="btn ghost" onClick={() => setStep(3)}>
                {t.kindSkip}
              </button>
            ),
            actions: (
              <button type="button" className="btn primary big" disabled={!kind} onClick={keepKind}>
                {t.kindNext}
              </button>
            ),
          }
    if (step === 3) return {
              cancel: false,
              extra: (
                <button type="button" className="btn ghost" onClick={open}>
                  {t.later}
                </button>
              ),
              actions: (
                <button type="button" className="btn primary big" disabled={checking} onClick={installed}>
                  {checking && <span className="btn-spin" aria-hidden="true" />}
                  {installLabel}
                  {!checking && <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />}
                </button>
              ),
            }
    return {
              cancel: false,
              extra: (
                <button type="button" className="btn ghost" onClick={() => setStep(3)}>
                  {t.back}
                </button>
              ),
              actions: (
                <>
                  <button type="button" className="btn ghost" onClick={open}>
                    {t.revenueSkip}
                  </button>
                  <button type="button" className="btn primary big" onClick={payments}>
                    {t.revenueConnect}
                  </button>
                </>
              ),
            }
  }

  return (
    <Modal
      label={t.label}
      className="add-site"
      onClose={onClose}
      keepSize={false}
      frame={{ title: <Title step={step} site={site} live={live} />, subtitle: t.sub[step - 1], icon: <ModalMark icon={headIcon(step)} />, size: 'lg', busy, ...foot() }}
    >
      <Steps compact labels={t.steps} at={step - 1} done={live && step === 3 ? 2 : undefined} onGo={(i) => setStep(i + 1)} />

      <StepBody step={step} className="wiz-step" fit>
        {step === 1 && <DomainStep domain={site ? site.domain : domain} setDomain={(d) => { setDomain(d); setRefusal('') }} refusal={refusal} note={prefill?.taken && clean === prefill.domain ? t.taken : ''} clean={clean} verdict={verdict} locked={site !== null} onSubmit={create} />}
        {step === 2 && <KindStep reading={reading} guess={guess} value={kind} onPick={setKind} />}
        {step === 3 && site && <Install site={site} visits={stream.visits} variant="wizard" check={check} />}
        {step === 4 && <p className="muted wiz-revenue">{t.revenueBody}</p>}
      </StepBody>
    </Modal>
  )
}
