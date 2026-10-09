// The way into connecting a provider: a search box, the most used providers as
// tiles, matches as you type, and the custom connection as the last line.
import { ArrowRight, Search } from 'lucide-react'
import { useState } from 'react'
import type { Provider } from '../lib/api'
import { findProviders, MOST_USED, PAY_PROVIDERS, searchableCount, WEBHOOK_PROVIDERS } from '../lib/payProviders'
import { payPickerCopy as t } from './payPickerCopy'
import { ProviderMark } from './ProviderMark'

export function PayPicker({ available, onPick }: { available: Provider[]; onPick: (p: Provider) => void }) {
  const [q, setQ] = useState('')
  const [on, setOn] = useState(0)
  const open = (id: string) => {
    const p = available.find((x) => x.id === id)
    if (p) onPick(p)
  }
  const canWebhook = available.some((a) => a.id === 'custom')
  const { hits, wallets } = findProviders(q, [...PAY_PROVIDERS.filter((p) => available.some((a) => a.id === p.id)), ...(canWebhook ? WEBHOOK_PROVIDERS : [])])
  const searching = q.trim() !== ''
  const tiles = MOST_USED.filter((id) => available.some((a) => a.id === id))
  const nameOf = (id: string) => available.find((a) => a.id === id)?.name ?? id
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOn((n) => Math.max(0, Math.min(n + (e.key === 'ArrowDown' ? 1 : -1), hits.length - 1)))
    } else if (e.key === 'Enter' && searching && hits[on]) {
      e.preventDefault()
      open(hits[on].viaWebhook ? 'custom' : hits[on].id)
    }
  }
  return (
    <div className="pay-pick">
      <label className="menu-search pay-pick-search">
        <Search size={17} strokeWidth={1.75} aria-hidden="true" />
        <input
          type="search"
          aria-label={t.search}
          placeholder={t.search}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOn(0)
          }}
          onKeyDown={keys}
        />
      </label>
      {!searching && (
        <>
          <span className="pay-group-head">{t.mostUsed}</span>
          <div className="prov-grid">
            {tiles.map((id) => (
              <button key={id} type="button" className="prov" onClick={() => open(id)}>
                <ProviderMark id={id} />
                <b>{nameOf(id)}</b>
                <span className="faint">
                  {t.connect} <ArrowRight size={12} strokeWidth={2} aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
          {canWebhook && <p className="faint pay-pick-note">{t.hint(searchableCount())}</p>}
        </>
      )}
      {searching && (
        <>
          <span className="pay-group-head">{t.matches}</span>
          {hits.length === 0 && <p className="faint pay-pick-note">{t.none}</p>}
          <ul className="pay-pick-list">
            {hits.map((p, i) => (
              <li key={p.id}>
                <button type="button" className="pay-pick-row" data-on={i === on ? '1' : undefined} onMouseEnter={() => setOn(i)} onClick={() => open(p.viaWebhook ? 'custom' : p.id)}>
                  <ProviderMark id={p.id} />
                  <b>{p.viaWebhook ? p.name : nameOf(p.id)}</b>
                  {p.viaWebhook && <span className="tag quiet">{t.viaWebhook}</span>}
                </button>
              </li>
            ))}
          </ul>
          {wallets && <p className="faint pay-pick-note">{t.wallets}</p>}
        </>
      )}
      {available.some((a) => a.id === 'custom') && (
        <button type="button" className="pay-pick-custom" onClick={() => open('custom')}>
          {t.custom}
        </button>
      )}
    </div>
  )
}
