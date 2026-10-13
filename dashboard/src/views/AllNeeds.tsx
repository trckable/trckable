// "Needs you": up to three cards on top of All sites, the most important
// first. Each says what is wrong in plain words, one quiet line of why (the
// status panel's own wording) and one button. With nothing to say, one calm line.
import { CircleAlert, Moon, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { sourceLine, surgeChip } from '../features/signals/surge'
import { copy as status } from '../features/sitestatus/copy'
import { when } from '../features/sitestatus/time'
import { navigate } from '../lib/url'
import { copy } from './allSitesCopy'
import { longSpan, type Need } from './allSitesNeeds'
import './AllNeeds.css'

const nameOf = (n: Need) => n.site.name || n.site.domain

function words(n: Need): { icon: ReactNode; title: string; why: string; button: string; to: string } {
  const open = '/' + encodeURIComponent(n.site.domain)
  const last = n.site.last_event_at ?? 0
  if (n.kind === 'down') {
    const since = n.site.check?.down_since
    return { icon: <CircleAlert size={18} aria-hidden="true" />, title: copy.downTitle(nameOf(n)), why: since ? status.downSince(when(since)) : status.causeDown, button: copy.seeWhy, to: open + '?status=1' }
  }
  if (n.kind === 'quiet') {
    const span = longSpan(Date.now() / 1000 - last)
    return { icon: <Moon size={18} aria-hidden="true" />, title: copy.quietTitle(nameOf(n), span), why: status.sinceVisit(when(last)), button: copy.seeWhy, to: open + '?status=1' }
  }
  const why = [sourceLine(n.surge) || copy.surgeWhy(n.surge.online), surgeChip(n.surge)].join(' · ')
  return { icon: <TrendingUp size={18} aria-hidden="true" />, title: copy.surgeTitle(nameOf(n)), why, button: copy.openSite, to: open }
}

export function AllNeeds({ needs, sites }: { needs: Need[]; sites: number }) {
  if (needs.length === 0) return <p className="all-fine muted">{copy.fine(sites)}</p>
  return (
    <section className="all-needs" aria-label={copy.needs}>
      <h2>{copy.needs}</h2>
      <ul>
        {needs.map((n) => {
          const w = words(n)
          return (
            <li key={n.kind + n.site.id} className={'all-need ' + n.kind}>
              <span className="all-need-icon">{w.icon}</span>
              <span className="all-need-text">
                <b>{w.title}</b>
                <span className="muted">{w.why}</span>
              </span>
              <button type="button" className="btn ghost" onClick={() => navigate(w.to)}>
                {w.button}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
