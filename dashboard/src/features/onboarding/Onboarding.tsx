// The first run: a person with no site yet. Three steps, three dots: which
// site first (the domain appears live in a mini dashboard), the one-line
// install (the install flow's own card, with room for more sites), and
// "Someone's here" the moment the live stream brings the first visit of any
// of them; its Continue opens Live mode.
// Its own lazy chunk: only the first run ever loads it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Wordmark } from '../../components/Logo'
import { fail, type Site, more, type Visit } from '../../lib/apiMore'
import { openAccount } from '../../lib/account'
import { signOut } from '../../lib/signOut'
import { navigate } from '../../lib/url'
import { useFocusTrap } from '../install/useFocusTrap'
import { FirstCards } from '../install/FirstCards'
import { Install } from '../install/Install'
import { AddAnother } from './AddAnother'
import { copy } from './copy'
import { Dots } from './Dots'
import { cleanDomain, dotOf, finishPath, firstVisited, type Step } from './model'
import { Preview } from './Preview'
import { markSkipped } from './skipped'
import { SiteStep } from './SiteStep'
import { SiteTabs } from './SiteTabs'
import { SiteWatch } from './SiteWatch'
import './onboarding.css'
import '../../kit/Modal.css'

/** required: nothing else may be reached until the first visit or "Skip for
 *  now" (Esc does nothing); resume: sites already added that have not had one. */
export default function Onboarding({ onClose, onSites, required = false, resume }: { onClose: () => void; onSites: () => Promise<unknown>; required?: boolean; resume?: Site[] }) {
  const [step, setStep] = useState<Step>(resume?.length ? 'install' : 'site')
  const [domain, setDomain] = useState('')
  const [sites, setSites] = useState<Site[]>(resume ?? [])
  const [active, setActive] = useState(resume?.[0]?.id ?? '')
  const [seen, setSeen] = useState<Record<string, Visit[] | undefined>>({})
  const [busy, setBusy] = useState(false)
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

  // A new step takes the focus to its heading (the site step's input asks
  // for it itself), so a screen reader hears where it is.
  useEffect(() => {
    if (step !== 'site') heading.current?.focus()
  }, [step])

  const create = () => {
    setBusy(true)
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    more
      .createSite(clean)
      .then((s) => more.updateSite(s.id, { timezone: zone }).catch(() => s))
      .then((s) => {
        setSites([s])
        setActive(s.id)
        setStep('install')
      })
      .catch((e: unknown) => fail(e, create))
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
  // "Skip for now — open my dashboard": waiting sites show their install there.
  const toDashboard = () => {
    markSkipped()
    leave('/all')
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

  const titles: Record<Step, string> = { site: copy.site.title, install: copy.install.title, here: copy.here.title }
  const subs: Record<Step, string> = {
    site: copy.site.sub,
    install: copy.install.sub(shown),
    here: copy.here.sub(shown),
  }

  return (
    <div ref={box} className={required ? 'ob gated' : 'ob'} role="dialog" aria-modal="true" aria-label={copy.label}>
      <header className="ob-top">
        <Wordmark />
        <Dots at={dotOf(step)} />
        {required ? (
          <nav className="ob-exits" aria-label={copy.account}>
            <a className="btn ghost" href="https://trckable.com/docs/">
              {copy.docs}
            </a>
            <button type="button" className="btn ghost" onClick={() => openAccount('profile')}>
              {copy.profile}
            </button>
            <button type="button" className="btn ghost" onClick={() => signOut()}>
              {copy.signOut}
            </button>
          </nav>
        ) : (
          <button type="button" className="btn ghost ob-skip" onClick={skip} aria-keyshortcuts="Escape">
            {copy.skip} <span className="kbd">{copy.skipHint}</span>
          </button>
        )}
      </header>
      <main className={`ob-main ob-${step}`} key={step}>
        <div className="ob-text">
          <span className="faint ob-step">{copy.progress(dotOf(step) + 1, 3)}</span>
          <h1 ref={heading} tabIndex={-1}>
            {titles[step]}
          </h1>
          <p className="muted">{subs[step]}</p>
          {step === 'site' && <SiteStep domain={domain} onDomain={setDomain} busy={busy} ready={!!clean} onSubmit={create} />}
          {step === 'here' && site && <FirstCards site={site} quiet />}
          {step === 'here' && (
            <div className="ob-actions">
              <button type="button" className="btn primary big" onClick={next}>
                {copy.here.go} <span className="kbd">{copy.enterKey}</span>
              </button>
            </div>
          )}
        </div>
        {step === 'install' && site ? (
          <div className="ob-install">
            {sites.length > 1 && <SiteTabs sites={sites} active={active} seen={seen} onPick={setActive} />}
            <Install
              key={site.id}
              site={site}
              visits={visits}
              variant="card"
              setup
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
        ) : (
          <Preview domain={shown} visits={visits} />
        )}
      </main>
      {sites.map((s) => (
        <SiteWatch key={s.id} id={s.id} onVisits={onVisits} />
      ))}
      <p className="sr" aria-live="assertive">
        {arrived ? copy.here.arrived(visits[0]?.path ?? '/') : ''}
      </p>
    </div>
  )
}
