// The first run: a person with no site yet. Three steps in a row at the top:
// which site first (the domain appears live in a mini dashboard), the code to
// add (with room for more sites), and the moment the live stream brings the
// first visit of any of them; its button opens that site's dashboard.
// Its own lazy chunk: only the first run ever loads it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { AccountMenu } from '../../components/AccountMenu'
import { Figure } from '../../figures/Figure'
import { ghostSvg } from '../../brand/logo'
import { type Site, more, type Visit } from '../../lib/apiMore'
import { quietOffline } from '../../lib/offline'
import { navigate } from '../../lib/url'
import { Header } from '../../v2/ui/Header'
import { checkDomain, cleanDomain, isAdded } from '../install/domain'
import { domainWords } from '../install/domainWords'
import { wizard } from '../install/copy'
import { formWords } from '../../lib/formWords'
import { useFocusTrap } from '../install/useFocusTrap'
import { AddAnother } from './AddAnother'
import { copy } from './copy'
import { FirstVisit } from './FirstVisit'
import { InstallStep } from './InstallStep'
import { finishPath, firstVisited, stepAt, type Step } from './model'
import { Preview } from './Preview'
import { markSkipped } from './skipped'
import { SiteStep } from './SiteStep'
import { Steps } from './Steps'
import { SiteTabs } from './SiteTabs'
import { SiteWatch } from './SiteWatch'
import '../../mock/mock.css'
import '../../kit/layout.css'
import '../../mock/theme.css'
import './onboarding.css'
import '../../kit/Modal.css'
import { firstStep, type SitePrefill } from '../../lib/addSiteLink'
import { browserZone } from '../../lib/format'

/** required: nothing else may be reached until the first visit or "Skip for
 *  now" (Esc does nothing); resume: sites already added that have not had one. */
export default function Onboarding({ onClose, onSites, required = false, resume, prefill = null }: { onClose: () => void; onSites: () => Promise<unknown>; required?: boolean; resume?: Site[]; prefill?: SitePrefill | null }) {
  const [start] = useState(() => firstStep(resume, prefill))
  const [step, setStep] = useState<Step>(start.step)
  const [domain, setDomain] = useState(prefill?.domain ?? '')
  const [sites, setSites] = useState<Site[]>(resume ?? [])
  const [active, setActive] = useState(start.active)
  const [seen, setSeen] = useState<Record<string, Visit[] | undefined>>({})
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const site = sites.find((s) => s.id === active) ?? null
  const visits = seen[active] ?? []
  const onVisits = useCallback((id: string, v: Visit[]) => setSeen((all) => (all[id] === v ? all : { ...all, [id]: v })), [])
  const box = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useFocusTrap(box, '.side-card')
  const clean = cleanDomain(domain)
  const shown = site?.domain ?? clean

  // The first visit on any site moves the install step on by itself, for that site.
  const winner = firstVisited(sites.map((s) => s.id), seen)
  const arrived = visits.length > 0
  if (winner && step === 'install') {
    setActive(winner)
    setStep('here')
  }

  // Nothing is cached yet: "offline, showing the last data" would be untrue here.
  useEffect(() => {
    quietOffline(true)
    return () => quietOffline(false)
  }, [])

  // A new step takes the focus to its heading (the site step's input asks
  // for it itself), so a screen reader hears where it is.
  useEffect(() => {
    if (step !== 'site') heading.current?.focus()
  }, [step])

  const create = () => {
    const verdict = checkDomain(clean, domain)
    const bad = domainWords(isAdded(clean, sites.map((x) => x.domain)) ? 'added' : verdict, clean)
    if (bad) {
      setProblem(bad)
      return
    }
    setBusy(true)
    setProblem('')
    const zone = browserZone()
    more
      .createSite(clean)
      .then((s) => more.updateSite(s.id, { timezone: zone }).catch(() => s))
      .then((s) => {
        setSites((all) => [...all, s])
        setActive(s.id)
        setStep('install')
      })
      .catch((e: unknown) => setProblem(formWords(e, { 500: wizard.failed, 502: wizard.failed, 503: wizard.failed, 504: wizard.failed })))
      .finally(() => setBusy(false))
  }

  // Leaving: the sites list learns about the new one first, so the address
  // it goes to is one the app knows.
  const leave = (path: string | null) => {
    void onSites().finally(() => {
      onClose()
      if (path) navigate(path)
    })
  }
  const skip = () => {
    if (!required) leave(site ? finishPath(site.domain, false) : null)
  }
  // "Skip for now — open my dashboard": the site's own page, where its install waits.
  const toDashboard = () => {
    markSkipped()
    leave(site ? finishPath(site.domain, false) : '/sites')
  }
  const added = (s: Site) => {
    setSites((all) => [...all, s])
    setActive(s.id)
  }

  // Keyboard first: Esc skips (unless a menu inside is closing), and Enter
  // moves on from the last screen wherever the focus is. Esc inside a side
  // card puts that card away, and only that.
  const next = () => {
    if (step === 'here' && site) leave(finishPath(site.domain, true))
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inner = (e.target as Element | null)?.closest?.('[role=menu], [role=listbox], .modal, .side-card')
      if (e.key === 'Escape' && !e.defaultPrevented && !inner) skip()
      if (e.key === 'Enter' && !(e.target as Element | null)?.closest?.('button, a, input, textarea, select')) next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const first = visits[0]
  const titles = { site: copy.site.title, install: copy.install.title, here: copy.here.title }
  const subs = { site: copy.site.sub, install: copy.install.sub(shown), here: copy.here.sub }

  return (
    <div ref={box} className={required ? 'ob gated' : 'ob'} role="dialog" aria-modal="true" aria-label={copy.label}>
      <div className="mk ob-hd">
        <Header
          logo={<span className="logo tkb-logo" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ghostSvg(30) }} />}
          site={null}
          views={null}
          period={null}
          explore={null}
          extras={
            <button type="button" className="btn ghost ob-skip" onClick={required ? toDashboard : skip} aria-keyshortcuts="Escape">
              {copy.skip} <span className="kbd">{copy.skipHint}</span>
            </button>
          }
          account={<AccountMenu />}
        />
      </div>
      <Steps at={stepAt(step)} />
      <main className="ob-main" data-step={step} key={step}>
        <div className="ob-text">
          {step === 'site' && <Figure name="computer" minWidth={641} className="ob-fig" />}
          {step === 'here' && (
            <span className="ob-check" aria-hidden="true">
              <Check size={44} strokeWidth={2.5} />
            </span>
          )}
          <h1 ref={heading} tabIndex={-1}>
            {titles[step]}
          </h1>
          <p className="muted">{subs[step]}</p>
          {step === 'site' && <SiteStep taken={!!prefill?.taken && clean === prefill.domain} focusGo={!!prefill} domain={domain} onDomain={(d) => { setDomain(d); setProblem('') }} problem={problem} busy={busy} ready={!!clean} onSubmit={create} />}
          {step === 'here' && <FirstVisit visit={first} />}
          {step === 'here' && (
            <div className="ob-actions">
              <button type="button" className="btn primary big" onClick={next}>
                {copy.here.go} <span className="kbd">{copy.enterKey}</span>
              </button>
            </div>
          )}
        </div>
        {step === 'install' && site && (
          <div className="ob-install">
            {sites.length > 1 && <SiteTabs sites={sites} active={active} seen={seen} onPick={setActive} />}
            <InstallStep
              key={site.id}
              site={site}
              visits={visits}
              after={
                <div className="ob-after">
                  <AddAnother sites={sites} onAdded={added} />
                  <button type="button" className="ob-skip-link" onClick={toDashboard}>
                    {copy.skipDash}
                  </button>
                </div>
              }
            />
          </div>
        )}
        {step === 'site' && <Preview domain={shown} />}
      </main>
      {sites.map((s) => (
        <SiteWatch key={s.id} id={s.id} onVisits={onVisits} />
      ))}
      <p className="sr" aria-live="assertive">
        {arrived ? copy.here.arrived(first?.path ?? '/') : ''}
      </p>
    </div>
  )
}
