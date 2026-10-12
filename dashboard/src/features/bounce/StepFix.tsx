// Step 4: a short list to try, each with one button. The ticks are for the
// person only; nothing is sent anywhere.
import { ArrowUpRight, Gauge, Link2, Search, Smartphone, type LucideIcon } from 'lucide-react'
import type { BounceCause } from '../../lib/apiMore'
import { copy } from './b'
import { fixesOf, onPhone, pageURL, topPage, type FixKey } from './fixes'
import { useTicks } from './ticks'

const ICON: Record<FixKey, LucideIcon> = { open: ArrowUpRight, see: Search, links: Link2, speed: Gauge }

/** A page that ends, and the same page ending in two links. */
function Ends() {
  return (
    <span className="bg-ends" aria-hidden="true">
      {[false, true].map((links) => (
        <span key={String(links)} className="bg-end">
          <i />
          <i className="short" />
          {links ? (
            <>
              <u />
              <u />
            </>
          ) : (
            <em />
          )}
          <small>{links ? copy.fix.withLinks : copy.fix.withoutLinks}</small>
        </span>
      ))}
    </span>
  )
}

type Props = { site: string; domain: string; causes: BounceCause[]; onSee: (page: string) => void; onSpeed: (page: string) => void }

export function StepFix({ site, domain, causes, onSee, onSpeed }: Props) {
  const [ticked, toggle] = useTicks(site)
  const page = topPage(causes)
  const act: Record<FixKey, (() => void) | null> = {
    open: () => window.open(pageURL(domain, page), '_blank', 'noopener,noreferrer'),
    see: page ? () => onSee(page) : null,
    links: null,
    speed: page ? () => onSpeed(page) : null,
  }
  const go: Record<FixKey, string> = { open: copy.go.open, see: copy.go.see, links: '', speed: copy.go.speed }
  return (
    <ul className="bg-step bg-fixes">
      {fixesOf(causes).map((k) => {
        const Icon = ICON[k]
        const line = copy.fix[k]
        const run = act[k]
        return (
          <li key={k} className="bg-fix">
            <input type="checkbox" checked={ticked.includes(k)} onChange={() => toggle(k)} aria-label={copy.tick(line)} />
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
            <span className="bg-fix-line">
              {line}
              {k === 'open' && onPhone(causes) && (
                <small className="muted">
                  <Smartphone size={12} aria-hidden="true" /> {copy.fix.phone}
                </small>
              )}
            </span>
            {k === 'links' && <Ends />}
            {run && (
              <button type="button" className="btn" onClick={run}>
                {go[k]}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
