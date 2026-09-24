import { useEffect, useState } from 'react'
import type { Visit } from '../lib/api'
import { flag } from '../lib/format'
import { channelColor, channelLabel } from '../lib/palette'

export function LiveFeed({ visits, connected, onVisitor }: { visits: (Visit & { id: number })[]; connected: boolean; onVisitor?: (v: string) => void }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000) // refresh "12s ago"
    return () => clearInterval(t)
  }, [])
  return (
    <div className="card">
      <div className="card-head">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pulse" aria-hidden="true" style={{ opacity: connected ? 1 : 0.3 }} />
          Live
        </h2>
        <span className="faint" style={{ fontSize: 12 }}>
          {connected ? 'Every visit as it happens' : 'Reconnecting…'}
        </span>
      </div>
      <ol aria-live="polite" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 360, overflow: 'hidden' }}>
        {visits.length === 0 && <li className="empty">Waiting for the next visit…</li>}
        {visits.map((v) => (
          <li
            key={v.id}
            className={onVisitor && v.visitor ? 'rise live-row' : 'rise'}
            onClick={onVisitor && v.visitor ? () => onVisitor(v.visitor!) : undefined}
            title={onVisitor && v.visitor ? 'See this visitor’s whole journey' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, fontSize: 13, cursor: onVisitor && v.visitor ? 'pointer' : undefined }}
          >
            <span className="dot" style={{ background: v.kind === 'goal' ? 'var(--accent)' : channelColor(v.channel ?? 'Direct') }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.kind === 'goal' ? (
                <>
                  <span className="muted">Goal</span> <span className="num">{v.goal}</span>
                </>
              ) : (
                <span className="num">{v.path}</span>
              )}
              <span className="faint">
                {' · '}
                {channelLabel(v.channel ?? 'Direct')}
                {v.referrer ? ` (${v.referrer})` : ''}
              </span>
            </span>
            <span title={[v.city, v.country].filter(Boolean).join(', ')}>{flag(v.country ?? '')}</span>
            <span className="faint num" style={{ fontSize: 11, width: 52, textAlign: 'right' }}>
              {ago(v.ts)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}
