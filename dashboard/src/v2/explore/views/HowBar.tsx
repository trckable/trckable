// How people open the site: a thin bar split into the ways (Desktop, iOS browser, iOS app, Android browser, Android app, a
// social app), each with its name and icon under it, and each a filter. Shown only once an app brought someone.
import { AppWindow, Compass, Monitor } from 'lucide-react'
import type { ReactNode } from 'react'
import { fmtInt, fmtPct } from '../../../lib/format'
import { howMark } from '../../../features/journey/Marks'
import { XSec } from '../../ui/XBits'
import { copy } from '../copy'
import { plain, logoOf } from '../rowMarks'
import type { How } from '../types'

const DIM = 'device_app'

/** The picture before a way's name: the system's mark, the desktop, or the social app's brand. */
export function howIcon(key: string): ReactNode {
  const [system, kind] = key.split('|')
  if (kind) return logoOf(system) ?? plain(kind === 'app' ? AppWindow : Compass)
  if (system === 'Desktop') return plain(Monitor)
  return howMark(system, true)
}

export function HowBar({ parts, of, selected, onPick }: { parts: How[]; of: number; selected: string | null; onPick: (dim: string, value: string) => void }) {
  const on = (p: How) => selected === p.key
  return (
    <div className="xhow">
      <XSec a={copy.howOpen} />
      <div className="xhow-bar">
        {parts.map((p, i) => (
          <button
            key={p.key}
            type="button"
            className={`xhow-part${selected && !on(p) ? ' off' : ''}`}
            data-xhow={p.key}
            title={`${p.name}: ${fmtInt(p.v)}`}
            aria-label={p.name}
            aria-pressed={on(p)}
            style={{ flexGrow: p.v, background: on(p) ? 'var(--mk-lime)' : `color-mix(in srgb, var(--mk-soft) ${Math.max(28, 100 - i * 14)}%, transparent)` }}
            onClick={() => onPick(DIM, p.key)}
          />
        ))}
      </div>
      <div className="xhow-names">
        {parts.map((p) => (
          <button key={p.key} type="button" className={`xhow-name${on(p) ? ' on' : ''}`} aria-pressed={on(p)} onClick={() => onPick(DIM, p.key)}>
            {howIcon(p.key)}
            <span className="cut">{p.name}</span>
            <span className="num">{fmtPct(of > 0 ? p.v / of : 0)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
