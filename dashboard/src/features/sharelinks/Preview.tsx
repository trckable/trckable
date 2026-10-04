// A small picture of what the link's reader will see, drawn from this site's
// own numbers and following the options next to it. It is not the real page.
import { Clock, Eye, Lock } from 'lucide-react'
import type { Numbers } from './numbers'
import { copy } from './copy'
import { previewParts } from './logic'
import type { Draft } from './logic'
import { tag } from '../../i18n'

const W = 300
const H = 64
const NOTES = [0.3, 0.68]

function Line({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * W},${H - 6 - (v / max) * (H - 18)}`)
  const line = pts.length > 1 ? 'M' + pts.join('L') : `M0,${H - 6}L${W},${H - 6}`
  return (
    <>
      <path d={`${line}L${W},${H}L0,${H}Z`} className="sl-area" />
      <path d={line} className="sl-line" fill="none" />
    </>
  )
}

function Bars({ values }: { values: number[] }) {
  const max = Math.max(...values, 0)
  if (!max) return null
  const w = W / values.length
  return values.map((v, i) => <rect key={i} className="sl-bar" x={i * w + w * 0.28} width={w * 0.44} y={H - 3 - (v / max) * 14} height={(v / max) * 14 + 3} rx={1.5} />)
}

function Rows({ title, widths, money }: { title: string; widths: number[]; money?: boolean }) {
  return (
    <div className="sl-panel">
      <span>{title}</span>
      {(widths.length ? widths : [0.9, 0.6, 0.4, 0.3]).map((w, i) => (
        <i key={i} className={money ? 'money' : ''} style={{ width: `${w * 100}%` }} />
      ))}
    </div>
  )
}

function Tile({ label, value, money }: { label: string; value: string; money?: boolean }) {
  return (
    <div className="sl-tile">
      <span>{label}</span>
      <b className={money ? 'money' : ''}>{value}</b>
    </div>
  )
}

function Locked() {
  return (
    <div className="sl-locked">
      <Lock size={16} strokeWidth={1.75} />
      <b>{copy.lockedTitle}</b>
      <span className="sl-fake">{copy.lockedField}</span>
    </div>
  )
}

export function Preview({ draft, numbers, domain, lockShown, onLock }: { draft: Draft; numbers: Numbers | null; domain: string; lockShown: boolean; onLock: () => void }) {
  const parts = previewParts(draft, lockShown)
  const dash = '–'
  return (
    <div className="sl-preview">
      <div className="sl-preview-head">
        <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
        <span>{copy.preview}</span>
        {draft.access === 'password' && (
          <button type="button" className="sl-lock" aria-pressed={lockShown} aria-label={lockShown ? copy.pageScreen : copy.lockScreen} title={lockShown ? copy.pageScreen : copy.lockScreen} onClick={onLock}>
            <Lock size={13} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="sl-frame" aria-hidden="true">
        <div className="sl-chrome">
          <i />
          <i />
          <i />
          <span>{globalThis.location?.host}/s/······</span>
        </div>
        {parts.lock ? (
          <Locked />
        ) : (
          <div className="sl-page">
            <div className="sl-top">
              <b>{domain}</b>
              {parts.ends && (
                <span className="sl-ends">
                  <Clock size={10} strokeWidth={1.75} />
                  {parts.ends.toLocaleDateString(tag, { day: 'numeric', month: 'short' })}
                </span>
              )}
              <span className="sl-range">{copy.rangeLabel}</span>
            </div>
            <div className={parts.revenueTile ? 'sl-tiles four' : 'sl-tiles'}>
              <Tile label={copy.visitors} value={numbers?.visitors ?? dash} />
              <Tile label={copy.views} value={numbers?.views ?? dash} />
              <Tile label={copy.bounce} value={numbers?.bounce ?? dash} />
              {parts.revenueTile && <Tile label={copy.revenue} value={numbers?.revenue ?? dash} money />}
            </div>
            <svg className="sl-chart" viewBox={`0 0 ${W} ${H}`}>
              <Line values={numbers?.line ?? []} />
              {parts.revenueBars && <Bars values={numbers?.bars ?? []} />}
              {parts.notes &&
                NOTES.map((x) => (
                  <g key={x} className="sl-note">
                    <line x1={x * W} x2={x * W} y1={6} y2={H} />
                    <circle cx={x * W} cy={5} r={3} />
                  </g>
                ))}
            </svg>
            <div className="sl-panels">
              <Rows title={copy.sources} widths={numbers?.sources ?? []} />
              {parts.revenueBars && <Rows title={copy.revenueByPage} widths={numbers?.pages ?? []} money />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
