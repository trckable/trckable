// The first run: a person with no site yet. Three steps, three dots: which
// site first (the domain appears live in a mini dashboard), the one-line
// install (the install flow's own card), and "Someone's here" the moment the
// live stream brings the first visit; then "You're live" opens Live mode.
// Its own lazy chunk: only the first run ever loads it.
import { useEffect, useRef, useState } from 'react'
import { Wordmark } from '../../components/Logo'
import { api, messageOf, type Site } from '../../lib/api'
import { navigate } from '../../lib/url'
import { useLive } from '../../lib/useLive'
import { useFocusTrap } from '../install/useFocusTrap'
import { Install } from '../install/Install'
import { copy } from './copy'
import { Dots } from './Dots'
import { cleanDomain, dotOf, finishPath, type Step } from './model'
import { Preview } from './Preview'
import { SiteStep } from './SiteStep'
import './onboarding.css'
import '../../components/Modal.css'

// Nothing to refresh: the first run only watches for visits.
const noRefetch = () => {}

export default function Onboarding({ onClose, onSites }: { onClose: () => void; onSites: () => Promise<unknown> }) {
  const [step, setStep] = useState<Step>('site')
  const [domain, setDomain] = useState('')
  const [site, setSite] = useState<Site | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const stream = useLive(site?.id ?? null, noRefetch)
  const box = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useFocusTrap(box)
  const clean = cleanDomain(domain)
  const shown = site?.domain ?? clean

  // The first visit moves the install step on by itself.
  const arrived = stream.visits.length > 0
  if (arrived && step === 'install') setStep('here')

  // A new step takes the focus to its heading (the site step's input asks
  // for it itself), so a screen reader hears where it is.
  useEffect(() => {
    if (step !== 'site') heading.current?.focus()
  }, [step])

  const create = () => {
    setBusy(true)
    setErr(null)
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    api
      .createSite(clean)
      .then((s) => api.updateSite(s.id, { timezone: zone }).catch(() => s))
      .then((s) => {
        setSite(s)
        setStep('install')
      })
      .catch((e: unknown) => setErr(messageOf(e)))
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
  const skip = () => leave(site ? finishPath(site.domain, false) : null)

  // Keyboard first: Esc skips (unless a menu inside is closing), and Enter
  // moves on from the last two screens wherever the focus is.
  const next = () => {
    if (step === 'here') setStep('done')
    else if (step === 'done' && site) leave(finishPath(site.domain, true))
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inner = (e.target as Element | null)?.closest?.('[role=menu], [role=listbox], .modal')
      if (e.key === 'Escape' && !e.defaultPrevented && !inner) skip()
      if (e.key === 'Enter' && !(e.target as Element | null)?.closest?.('button, a, input, textarea, select')) next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const titles: Record<Step, string> = { site: copy.site.title, install: copy.install.title, here: copy.here.title, done: copy.done.title }
  const subs: Record<Step, string> = {
    site: copy.site.sub,
    install: copy.install.sub(shown),
    here: copy.here.sub(shown),
    done: copy.done.sub(shown),
  }

  return (
    <div ref={box} className="ob" role="dialog" aria-modal="true" aria-label={copy.label}>
      <header className="ob-top">
        <Wordmark />
        <Dots at={dotOf(step)} />
        <button type="button" className="btn ghost ob-skip" onClick={skip} aria-keyshortcuts="Escape">
          {copy.skip} <span className="kbd">{copy.skipHint}</span>
        </button>
      </header>
      <main className={`ob-main ob-${step}`} key={step}>
        <div className="ob-text">
          <span className="faint ob-step">{copy.progress(dotOf(step) + 1, 3)}</span>
          <h1 ref={heading} tabIndex={-1}>
            {titles[step]}
          </h1>
          <p className="muted">{subs[step]}</p>
          {step === 'site' && <SiteStep domain={domain} onDomain={setDomain} busy={busy} err={err} ready={!!clean} onSubmit={create} />}
          {step === 'here' && (
            <div className="ob-actions">
              <button type="button" className="btn primary big" onClick={next}>
                {copy.here.go} <span className="kbd">{copy.enterKey}</span>
              </button>
            </div>
          )}
          {step === 'done' && site && (
            <div className="ob-actions">
              <button type="button" className="btn primary big" onClick={next}>
                {copy.done.live} <span className="kbd">{copy.enterKey}</span>
              </button>
            </div>
          )}
        </div>
        {step === 'install' && site ? (
          <div className="ob-install">
            <Install site={site} visits={stream.visits} variant="card" />
          </div>
        ) : (
          <Preview domain={shown} visits={stream.visits} />
        )}
      </main>
      <p className="sr" aria-live="assertive">
        {arrived ? copy.here.arrived(stream.visits[stream.visits.length - 1]?.path ?? '/') : ''}
      </p>
    </div>
  )
}
