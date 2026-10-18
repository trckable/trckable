// Settings → Answers, the rest: other sites to compare, where the questions are asked from, asking now, what leaves the server, the budget.
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { messageOf } from '../../lib/api'
import { fmtMoney } from '../../lib/format'
import { openSettings } from '../../lib/settings'
import { tag } from '../../i18n'
import type { Site } from '../../lib/api'
import { answersCopy as c } from './copy'
import { answersApi, ENGINES, type AnswersSetup, type Competitor } from './api'
import { COUNTRIES } from './country'
import { GhostMark } from './GhostMark'
import { where } from './when'

const SIX_HOURS = 6 * 3600

export function SettingsRivals({ list, onList, max, suggested, viewer }: { list: Competitor[]; onList: (l: Competitor[]) => void; max: number; suggested: Competitor[]; viewer: boolean }) {
  const set = (i: number, p: Partial<Competitor>) => onList(list.map((r, k) => (k === i ? { ...r, ...p } : r)))
  const left = suggested.filter((s) => !list.some((r) => r.domain === s.domain))
  return (
    <div className="an-set">
      <div className="an-set-head">
        <h4>{c.settings.competitors}</h4>
        <span className="an-count">{c.settings.count(list.length, max)}</span>
      </div>
      <p className="an-help">{c.settings.competitorHelp}</p>
      <div className="an-rl">
        {list.map((r, i) => (
          <div key={i} className="an-rrow">
            <input className="an-in" value={r.name} disabled={viewer} maxLength={60} aria-label={c.settings.siteName} onChange={(e) => set(i, { name: e.target.value })} />
            <input className="an-in mono" value={r.domain} disabled={viewer} maxLength={80} aria-label={c.settings.siteDomain} onChange={(e) => set(i, { domain: e.target.value.toLowerCase() })} />
            {!viewer && (
              <button type="button" className="an-ico" aria-label={c.settings.removeSite} onClick={() => onList(list.filter((_, k) => k !== i))}>
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!viewer && list.length < max && (
        <button type="button" className="an-btn small" onClick={() => onList([...list, { name: '', domain: '' }])}>
          <Plus size={14} aria-hidden="true" />
          {c.settings.addSite}
        </button>
      )}
      {!viewer && list.length < max && left.length > 0 && (
        <div className="an-sug">
          {left.slice(0, max - list.length).map((s) => (
            <button key={s.domain} type="button" className="an-chip" onClick={() => onList([...list, s])}>
              <Plus size={12} aria-hidden="true" />
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SettingsAsk({ setup, site, country, onCountry, viewer }: { setup: AnswersSetup; site: Site; country: string; onCountry: (c: string) => void; viewer: boolean }) {
  const recent = (setup.asked_at ?? 0) + SIX_HOURS > Math.floor(Date.now() / 1000)
  const [state, setState] = useState<'idle' | 'asking' | 'recent'>(recent ? 'recent' : 'idle')
  const [said, setSaid] = useState('')
  const run = () => {
    setState('asking')
    setSaid('')
    answersApi
      .run(site.id)
      .then(() => setState('recent'))
      .catch((e: unknown) => {
        setState('idle')
        setSaid(messageOf(e))
      })
  }
  const codes = COUNTRIES.includes(country) || !country ? COUNTRIES : [country, ...COUNTRIES]
  return (
    <div className="an-set">
      <div className="an-set-head">
        <h4>{c.settings.country}</h4>
      </div>
      <select className="an-in an-sel" value={country} disabled={viewer} aria-label={c.settings.country} onChange={(e) => onCountry(e.target.value)}>
        <option value="">{c.settings.anyCountry}</option>
        {codes.map((k) => (
          <option key={k} value={k}>
            {where(k)}
          </option>
        ))}
      </select>
      <p className="an-help">
        {c.settings.words}{' '}
        <button type="button" className="an-link" onClick={() => openSettings(site, 'mentions')}>
          {c.settings.wordsLink}
        </button>
      </p>
      {!viewer && (
        <div className="an-run">
          <button type="button" className="an-btn" disabled={state !== 'idle'} onClick={run}>
            {state === 'asking' ? c.settings.asking : c.settings.runNow}
          </button>
          {state === 'recent' && <span className="an-help">{c.settings.ranRecently}</span>}
          {said && <span className="an-warn">{said}</span>}
        </div>
      )}
    </div>
  )
}

const list = (names: string[]) => new Intl.ListFormat(tag ?? 'en', { type: 'conjunction' }).format(names)

export function SettingsFoot({ setup }: { setup: AnswersSetup }) {
  const b = setup.budget
  const usd = (n: number) => fmtMoney(Math.round(n * 100), 'USD', 2, { cents: n % 1 !== 0 })
  return (
    <div className="an-set">
      <div className="an-engs" aria-label={c.settings.engines}>
        {ENGINES.map((e) => {
          const on = setup.engines.some((x) => x.id === e)
          return (
            <span key={e} className={on ? '' : 'off'}>
              <GhostMark state={on ? 'both' : 'none'} size={16} label={c.engine[e]} />
              {c.engine[e]}
            </span>
          )
        })}
      </div>
      <p className="an-help">{c.settings.sends(list(setup.engines.map((e) => e.name)))}</p>
      {b && (
        <div className="an-budget">
          <span className="an-help">{b.paused ? c.paused : c.settings.budget(usd(b.used), b.cap ? usd(b.cap) : '∞')}</span>
          {b.cap > 0 && (
            <span className="an-prog" role="progressbar" aria-label={c.settings.budgetLabel} aria-valuemin={0} aria-valuemax={b.cap} aria-valuenow={b.used}>
              <i style={{ width: `${Math.min(100, (b.used / b.cap) * 100)}%` }} />
            </span>
          )}
        </div>
      )}
    </div>
  )
}
