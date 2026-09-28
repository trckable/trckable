// After "I've installed it": what the server found on the homepage, then the
// wait for the first visit, which turns live the moment the stream brings it.
import { ArrowRight, Check, TriangleAlert } from 'lucide-react'
import type { Visit } from '../../lib/api'
import { copy, type Outcome } from './copy'
import { outcomeOf } from './outcome'
import type { CheckState } from './useInstallCheck'

const TONE: Record<Outcome, 'ok' | 'warn'> = { site: 'ok', none: 'warn', nosite: 'warn', other: 'warn', unreachable: 'warn' }

function Found({ state, domain }: { state: CheckState; domain: string }) {
  if (state.phase === 'idle') return null
  if (state.phase === 'checking' && !state.last)
    return (
      <li className="inst-found wait">
        <span className="btn-spin" aria-hidden="true" />
        {copy.checking(domain)}
      </li>
    )
  const shown = state.phase === 'done' ? state.result : state.last
  const o = shown ? outcomeOf(shown, domain) : null
  return (
    <>
      {o && (
        <li className={'inst-found ' + TONE[o.kind]} data-found={o.kind}>
          {TONE[o.kind] === 'ok' ? <Check size={16} strokeWidth={2.25} aria-hidden="true" /> : <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" />}
          <span>
            {o.text}
            {o.via && <span className="faint inst-via">{o.via}</span>}
          </span>
        </li>
      )}
      {state.phase === 'limited' && <li className="inst-found info">{copy.limited}</li>}
      {state.phase === 'failed' && <li className="inst-found info">{copy.failed}</li>}
    </>
  )
}

export function CheckPanel({ state, domain, first, onAgain }: { state: CheckState; domain: string; first?: Visit; onAgain: () => void }) {
  const found = state.phase === 'done' && state.result.found === 'site'
  const busy = state.phase === 'checking'
  return (
    <div className="inst-check" aria-live="polite" aria-busy={busy}>
      <ul>
        <Found state={state} domain={domain} />
        {first ? (
          <li className="inst-found ok live" data-live="1">
            <span className="dot" aria-hidden="true" />
            {copy.live(first.path ?? '/')}
          </li>
        ) : (
          <li className="inst-found wait">
            <span className="pulse" aria-hidden="true" />
            {copy.waiting(domain)}
          </li>
        )}
      </ul>
      {!first && !found && (
        <p className="faint inst-recheck">
          {copy.recheck}
          <button type="button" className="linkish" onClick={onAgain} disabled={busy}>
            {copy.checkAgain}
            <ArrowRight size={13} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </p>
      )}
    </div>
  )
}
