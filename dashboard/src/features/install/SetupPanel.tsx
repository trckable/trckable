// The install status: a timeline of two steps (the site exists, the first visit), one note when the check found a problem,
// and the two actions. On a phone the same card is one bar pinned to the bottom. A step's mark keeps its size when it
// ticks, so nothing moves. When the first visit lands the card ticks, the ghost hops and the heading says so for a moment.
import { ArrowUpRight, ChevronDown, ChevronUp, RefreshCw, Sparkles } from 'lucide-react'
import { useId, useState } from 'react'
import { ghostSvg } from '../../brand/logo'
import type { Site } from '../../lib/api'
import { journey as t } from './journeyCopy'
import { findingOf, Why } from './SetupWhy'
import { staleDays, type Stage } from './journey'
import { dateFmt } from '../../lib/format'
import { useCheckRun } from './useCheckRun'
import type { InstallCheckHandle } from './useInstallCheck'
import './setupPanel.css'

const keyOf = (id: string) => 'trckable:setup-min:' + id

/** Whether the card is minimised to its pill: remembered per site, in this browser only. */
export function useMinimised(site: string): [boolean, (on: boolean) => void] {
  const [min, setMin] = useState(() => {
    try {
      return localStorage.getItem(keyOf(site)) === '1'
    } catch {
      return false
    }
  })
  const set = (on: boolean) => {
    setMin(on)
    try {
      if (on) localStorage.setItem(keyOf(site), '1')
      else localStorage.removeItem(keyOf(site))
    } catch {
      /* storage blocked: it stays for this visit */
    }
  }
  return [min, set]
}

const clock = (tz: string, at: number): string => dateFmt(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(at)

const ghost = (size: number) => <span className="ist-ghost" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ghostSvg(size) }} />

function Step({ state, name, note, ping }: { state: 'done' | 'now'; name: string; note: string; ping?: number }) {
  return (
    <li className={'ist-step ' + state}>
      <span className="ist-mark" aria-hidden="true">
        {state === 'done' && (
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path className="ist-tick" d="M2.5 6.5l2.5 2.5 4.5-5" pathLength="1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {ping ? <i className="ist-ping" key={ping} /> : null}
      </span>
      <span className="ist-name">{name}</span>
      <span className="ist-note faint">{note}</span>
    </li>
  )
}

/** The button's words: what is running, what the last press found, or the plain invitation. */
function Result({ run, site }: { run: ReturnType<typeof useCheckRun>; site: Site }) {
  const p = t.panel
  if (run.running) return <span className="ist-shimmer">{p.checking}</span>
  if (run.limited) return <><span className="ist-wide">{p.limited}</span><span className="ist-narrow">{p.limitedShort}</span></>
  if (run.outcome === 'none') return <>{t.now}</>
  const long = run.outcome === 'seen' ? p.none(clock(site.timezone, run.shownAt)) : p.failed
  return (
    <>
      <span className="ist-wide">{long}</span>
      <span className="ist-narrow">{run.outcome === 'seen' ? p.noneShort : p.failedShort}</span>
    </>
  )
}

/** stage: what the page may say now (it holds a problem back while the code is still being pasted). */
export function SetupPanel({ site, check, stage, onCheck }: { site: Site; check: InstallCheckHandle; stage: Stage; onCheck: () => void }) {
  const run = useCheckRun({ ...check, start: onCheck })
  const p = t.panel
  const body = useId()
  const [min, setMin] = useMinimised(site.id)
  const arrived = stage === 'arrived'
  const days = staleDays(site)
  const stuck = stage === 'waiting' || stage === 'limited'
  const problem = stuck ? days > 0 : stage !== 'found' && stage !== 'arrived'
  const note = problem ? findingOf(stage, check, days) : null
  return (
    <aside className={min ? 'ist min' : 'ist'} aria-label={p.title} data-stage={stage}>
      <div className="ist-card">
        <button type="button" className="ist-tog" aria-expanded={!min} aria-controls={body} aria-label={min ? p.show : p.hide} title={min ? p.show : p.hide} onClick={() => setMin(!min)}>
          {min ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
        <div className="ist-head">
          {ghost(20)}
          <h2 aria-live="polite">
            {arrived && <Sparkles size={14} aria-hidden="true" />}
            {arrived ? p.live : p.title}
          </h2>
          <span className="ist-live faint">
            <i className="ist-radar" aria-hidden="true" />
            {p.listening}
          </span>
        </div>
        <span className="ist-bar-text">
          {ghost(18)}
          <i className="ist-radar" aria-hidden="true" />
          {arrived ? p.got : p.bar}
        </span>
        <ol id={body} className="ist-steps" data-filled={arrived}>
          <Step state="done" name={p.created} note={site.domain} />
          <Step state={arrived ? 'done' : 'now'} name={p.visit} note={arrived ? p.got : p.once} ping={arrived ? 0 : run.presses} />
        </ol>
        {note && (
          <div className="ist-find">
            <b>{note.head}</b>
            <span>{note.line}</span>
            <Why stage={stage} site={site} />
          </div>
        )}
        <div className="ist-act">
          <a key={run.outcome === 'seen' ? run.presses : 0} className={run.outcome === 'seen' ? 'btn primary ist-open nudge' : 'btn primary ist-open'} href={`https://${site.domain}`} target="_blank" rel="noreferrer">
            <span>{t.openSite(site.domain)}</span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <button type="button" className={'ist-check ' + (run.running ? 'busy' : run.outcome)} disabled={arrived} aria-disabled={run.running || run.limited || arrived} onClick={run.press}>
            <RefreshCw size={14} aria-hidden="true" key={run.running ? 'spin' : run.presses} />
            <span className="ist-result" aria-live="polite">
              <Result run={run} site={site} />
            </span>
          </button>
        </div>
      </div>
    </aside>
  )
}
