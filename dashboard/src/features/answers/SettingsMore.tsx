// Settings → Answers, the rest: other sites to compare, where the questions are asked from, asking now, what leaves the server, the budget.
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { openSettings } from '../../lib/settings'
import type { Site } from '../../lib/api'
import { answersCopy as c } from './copy'
import { ENGINES, type AnswersSettingsData } from './api'
import { GhostMark } from './GhostMark'

type Rival = AnswersSettingsData['rivals'][number]

export function SettingsRivals({ list, onList, viewer }: { list: Rival[]; onList: (l: Rival[]) => void; viewer: boolean }) {
  const set = (i: number, p: Partial<Rival>) => onList(list.map((r, k) => (k === i ? { ...r, ...p } : r)))
  return (
    <div className="an-set">
      <div className="an-set-head">
        <h4>{c.settings.competitors}</h4>
        <span className="an-count">{c.settings.count(list.length, 5)}</span>
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
      {!viewer && list.length < 5 && (
        <button type="button" className="an-btn small" onClick={() => onList([...list, { name: '', domain: '' }])}>
          <Plus size={14} aria-hidden="true" />
          {c.settings.addSite}
        </button>
      )}
    </div>
  )
}

export function SettingsAsk({ data, site, viewer }: { data: AnswersSettingsData; site: Site; viewer: boolean }) {
  const [country, setCountry] = useState(data.country)
  const [state, setState] = useState<'idle' | 'asking' | 'recent'>(data.askedRecently ? 'recent' : 'idle')
  const run = () => {
    setState('asking')
    setTimeout(() => setState('recent'), 1800)
  }
  return (
    <div className="an-set">
      <div className="an-set-head">
        <h4>{c.settings.country}</h4>
      </div>
      <select className="an-in an-sel" value={country} disabled={viewer} aria-label={c.settings.country} onChange={(e) => setCountry(e.target.value)}>
        {Object.entries(c.countries).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <p className="an-help">
        {c.settings.words}{' '}
        <button type="button" className="an-link" onClick={() => openSettings(site, 'mentions')}>
          {c.settings.wordsLink}
        </button>
      </p>
      <div className="an-run">
        <button type="button" className="an-btn" disabled={viewer || state !== 'idle'} onClick={run}>
          {state === 'asking' ? c.settings.asking : c.settings.runNow}
        </button>
        {state === 'recent' && <span className="an-help">{c.settings.ranRecently}</span>}
      </div>
    </div>
  )
}

export function SettingsFoot({ data }: { data: AnswersSettingsData }) {
  const pct = Math.min(100, (data.spent / data.cap) * 100)
  return (
    <div className="an-set">
      <div className="an-engs" aria-label={c.settings.engines}>
        {ENGINES.map((e) => (
          <span key={e} className={data.engines.includes(e) ? '' : 'off'}>
            <GhostMark state={data.engines.includes(e) ? 'both' : 'none'} size={16} label={c.engine[e]} />
            {c.engine[e]}
          </span>
        ))}
      </div>
      <p className="an-help">{c.settings.sends}</p>
      <div className="an-budget">
        <span className="an-help">{c.settings.budget(`$${data.spent.toFixed(2).replace(/\.00$/, '')}`, `$${data.cap}`)}</span>
        <span className="an-prog" role="progressbar" aria-label={c.settings.budgetLabel} aria-valuemin={0} aria-valuemax={data.cap} aria-valuenow={data.spent}>
          <i style={{ width: `${pct}%` }} />
        </span>
      </div>
    </div>
  )
}
