// The keys of the Briefing: j and k walk the cards, Enter opens the one the keyboard is on, e opens Explore, L and B
// switch between Live and the Briefing. The first use hides the row of hints for good.
import { useEffect, useRef } from 'react'
import { goExplore } from './deeper'
import { switchTab } from '../../features/live/switchView'
import type { useBriefingState } from './useBriefingState'

/** The card after (or before) the one the keyboard is on; the first (or the last) when it is on none. */
export function nextCard(at: number, n: number, down: boolean): number {
  if (at < 0) return down ? 0 : n - 1
  return Math.max(0, Math.min(n - 1, at + (down ? 1 : -1)))
}

export function useBriefingKeys(o: { cards: string[]; ui: ReturnType<typeof useBriefingState>; open: (key: string) => void }) {
  const last = useRef(o)
  useEffect(() => {
    last.current = o
  })
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const { cards, ui, open } = last.current
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tg = (e.target as HTMLElement).tagName
      if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return
      if (document.querySelector('.xscrim.on, .cd.on')) return
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (!['j', 'k', 'e', 'l', 'b', 'Enter'].includes(k)) return
      const onCard = (document.activeElement as HTMLElement | null)?.classList.contains('icard')
      if (ui.hint && (k !== 'Enter' || onCard)) ui.hideHint()
      if (k === 'l') void switchTab('live', 'briefing')
      else if (k === 'b') void switchTab('briefing', 'briefing')
      else if (k === 'e') goExplore()
      else if (k === 'j' || k === 'k') {
        if (!cards.length) return
        const at = ui.kf ? cards.indexOf(ui.kf) : -1
        const i = nextCard(at, cards.length, k === 'j')
        ui.setKf(cards[i])
        const el = document.querySelector<HTMLElement>(`.icard[data-topic="${cards[i]}"]`)
        el?.focus({ preventScroll: true })
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      } else if (k === 'Enter' && onCard) open((document.activeElement as HTMLElement).dataset.topic ?? '')
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [])
}
